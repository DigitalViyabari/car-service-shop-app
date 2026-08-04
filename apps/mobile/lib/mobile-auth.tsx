import type { Branch, Company, Membership, UserProfile } from "@dvcs/types";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { firebase } from "./firebase";

type MobileAuth = {
  user: User | null;
  profile: UserProfile | null;
  membership: Membership | null;
  company: Company | null;
  branch: Branch | null;
  loading: boolean;
  error: string | null;
  signOutUser: () => Promise<void>;
};

const Context = createContext<MobileAuth | null>(null);
const withId = <T extends { id: string }>(snapshot: { id: string; data: () => unknown }) =>
  ({ ...(snapshot.data() as object), id: snapshot.id }) as T;

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (current: User) => {
    setLoading(true);
    setError(null);
    try {
      const [profileDoc, membershipDocs] = await Promise.all([
        getDoc(doc(firebase.db, "users", current.uid)),
        getDocs(
          query(
            collection(firebase.db, "memberships"),
            where("userId", "==", current.uid),
            where("status", "==", "active"),
          ),
        ),
      ]);
      const membershipDoc = membershipDocs.docs[0];
      if (!profileDoc.exists() || !membershipDoc)
        throw new Error("No active workshop access is assigned to this account.");
      const nextMembership = withId<Membership>(membershipDoc);
      const companyDoc = await getDoc(doc(firebase.db, "companies", nextMembership.companyId));
      let branchId =
        nextMembership.branchIds?.[0] ?? nextMembership.branchAssignments?.[0]?.branchId;
      if (!branchId && nextMembership.companyRoles?.length) {
        const branches = await getDocs(
          query(
            collection(firebase.db, "branches"),
            where("companyId", "==", nextMembership.companyId),
          ),
        );
        branchId = branches.docs.find((item) => item.get("status") === "active")?.id;
      }
      if (!companyDoc.exists() || !branchId)
        throw new Error("No active branch is assigned to this account.");
      const branchDoc = await getDoc(doc(firebase.db, "branches", branchId));
      if (!branchDoc.exists()) throw new Error("The assigned branch is unavailable.");
      setProfile(withId<UserProfile>(profileDoc));
      setMembership({
        ...nextMembership,
        companyRoles: nextMembership.companyRoles ?? [],
        branchIds: nextMembership.branchIds ?? [],
        branchAssignments: nextMembership.branchAssignments ?? [],
      });
      setCompany(withId<Company>(companyDoc));
      setBranch(withId<Branch>(branchDoc));
    } catch (reason) {
      setProfile(null);
      setMembership(null);
      setCompany(null);
      setBranch(null);
      setError(reason instanceof Error ? reason.message : "Unable to open the workshop.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(firebase.auth, (nextUser) => {
        setUser(nextUser);
        if (nextUser) void loadWorkspace(nextUser);
        else {
          setProfile(null);
          setMembership(null);
          setCompany(null);
          setBranch(null);
          setLoading(false);
        }
      }),
    [loadWorkspace],
  );

  const value = useMemo<MobileAuth>(
    () => ({
      user,
      profile,
      membership,
      company,
      branch,
      loading,
      error,
      signOutUser: () => signOut(firebase.auth),
    }),
    [branch, company, error, loading, membership, profile, user],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMobileAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("MobileAuthProvider is missing.");
  return value;
}
