import type { Branch, Company, Membership, UserProfile } from "@dvcs/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  branches: Branch[];
  loading: boolean;
  error: string | null;
  selectBranch: (branchId: string) => Promise<void>;
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
  const [branches, setBranches] = useState<Branch[]>([]);
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
      let nextBranches: Branch[] = [];
      if (nextMembership.companyRoles?.length) {
        const branchDocs = await getDocs(
          query(
            collection(firebase.db, "branches"),
            where("companyId", "==", nextMembership.companyId),
          ),
        );
        nextBranches = branchDocs.docs
          .map((item) => withId<Branch>(item))
          .filter((item) => item.status === "active");
      } else {
        const branchIds = [
          ...(nextMembership.branchIds ?? []),
          ...(nextMembership.branchAssignments ?? []).map((item) => item.branchId),
        ].filter((value, index, all) => value && all.indexOf(value) === index);
        const branchDocs = await Promise.all(
          branchIds.map((branchId) => getDoc(doc(firebase.db, "branches", branchId))),
        );
        nextBranches = branchDocs
          .filter((item) => item.exists())
          .map((item) => withId<Branch>(item))
          .filter((item) => item.status === "active");
      }
      if (!companyDoc.exists() || !nextBranches.length)
        throw new Error("No active branch is assigned to this account.");
      const storedBranchId = await AsyncStorage.getItem("dvcs.activeBranchId");
      const nextBranch =
        nextBranches.find((item) => item.id === storedBranchId) ?? nextBranches[0]!;
      setProfile(withId<UserProfile>(profileDoc));
      setMembership({
        ...nextMembership,
        companyRoles: nextMembership.companyRoles ?? [],
        branchIds: nextMembership.branchIds ?? [],
        branchAssignments: nextMembership.branchAssignments ?? [],
      });
      setCompany(withId<Company>(companyDoc));
      setBranches(nextBranches);
      setBranch(nextBranch);
      await AsyncStorage.setItem("dvcs.activeBranchId", nextBranch.id);
    } catch (reason) {
      setProfile(null);
      setMembership(null);
      setCompany(null);
      setBranch(null);
      setBranches([]);
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
          setBranches([]);
          setLoading(false);
        }
      }),
    [loadWorkspace],
  );

  const selectBranch = useCallback(
    async (branchId: string) => {
      const nextBranch = branches.find((item) => item.id === branchId);
      if (!nextBranch) return;
      setBranch(nextBranch);
      await AsyncStorage.setItem("dvcs.activeBranchId", nextBranch.id);
    },
    [branches],
  );

  const value = useMemo<MobileAuth>(
    () => ({
      user,
      profile,
      membership,
      company,
      branch,
      branches,
      loading,
      error,
      selectBranch,
      signOutUser: () => signOut(firebase.auth),
    }),
    [branch, branches, company, error, loading, membership, profile, selectBranch, user],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMobileAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("MobileAuthProvider is missing.");
  return value;
}
