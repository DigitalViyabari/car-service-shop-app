"use client";

import type { Branch, BranchSubscription, Company, Membership, UserProfile } from "@dvcs/types";
import type { User } from "firebase/auth";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { firebaseClient } from "./firebase-client";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  memberships: Membership[];
  companies: Company[];
  branches: Branch[];
  subscriptions: BranchSubscription[];
  activeCompany: Company | null;
  activeBranch: Branch | null;
  activeCompanyId: string | null;
  activeBranchId: string | null;
  loading: boolean;
  error: string | null;
  selectCompany: (companyId: string) => void;
  selectBranch: (branchId: string) => void;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function fromDocument<T extends { id: string }>(snapshot: DocumentSnapshot): T {
  return { ...snapshot.data(), id: snapshot.id } as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [subscriptions, setSubscriptions] = useState<BranchSubscription[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearTenantState = useCallback(() => {
    setProfile(null);
    setMemberships([]);
    setCompanies([]);
    setBranches([]);
    setSubscriptions([]);
    setActiveCompanyId(null);
    setActiveBranchId(null);
  }, []);

  const loadTenantState = useCallback(async (firebaseUser: User) => {
    const profileSnapshot = await getDoc(doc(firebaseClient.db, "users", firebaseUser.uid));
    const membershipSnapshots = await getDocs(
      query(
        collection(firebaseClient.db, "memberships"),
        where("userId", "==", firebaseUser.uid),
        where("status", "==", "active"),
      ),
    );
    const nextMemberships = membershipSnapshots.docs.map((snapshot) => {
      const membership = fromDocument<Membership>(snapshot);
      return {
        ...membership,
        companyRoles: membership.companyRoles ?? [],
        branchIds: membership.branchIds ?? [],
        branchAssignments: membership.branchAssignments ?? [],
      };
    });
    const companySnapshots = await Promise.all(
      nextMemberships.map((membership) =>
        getDoc(doc(firebaseClient.db, "companies", membership.companyId)),
      ),
    );
    const nextCompanies = companySnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => fromDocument<Company>(snapshot));
    const branchGroups = await Promise.all(
      nextMemberships.map(async (membership) => {
        if (membership.companyRoles.length > 0) {
          const snapshots = await getDocs(
            query(
              collection(firebaseClient.db, "branches"),
              where("companyId", "==", membership.companyId),
            ),
          );
          return snapshots.docs.map((item) => fromDocument<Branch>(item));
        }
        const snapshots = await Promise.all(
          membership.branchIds.map((branchId) =>
            getDoc(doc(firebaseClient.db, "branches", branchId)),
          ),
        );
        return snapshots
          .filter((snapshot) => snapshot.exists())
          .map((snapshot) => fromDocument<Branch>(snapshot));
      }),
    );
    const nextBranches = branchGroups.flat();
    const subscriptionSnapshots = await Promise.all(
      nextBranches.map((branch) =>
        getDoc(doc(firebaseClient.db, "branchSubscriptions", branch.id)),
      ),
    );
    const nextSubscriptions = subscriptionSnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => fromDocument<BranchSubscription>(snapshot));

    setProfile(profileSnapshot.exists() ? fromDocument<UserProfile>(profileSnapshot) : null);
    setMemberships(nextMemberships);
    setCompanies(nextCompanies);
    setBranches(nextBranches);
    setSubscriptions(nextSubscriptions);

    const storedCompanyId = window.localStorage.getItem("dvcs.activeCompanyId");
    const nextCompanyId = nextCompanies.some(({ id }) => id === storedCompanyId)
      ? storedCompanyId
      : (nextCompanies[0]?.id ?? null);
    const companyBranches = nextBranches.filter(({ companyId }) => companyId === nextCompanyId);
    const storedBranchId = window.localStorage.getItem("dvcs.activeBranchId");
    const nextBranchId = companyBranches.some(({ id }) => id === storedBranchId)
      ? storedBranchId
      : (companyBranches[0]?.id ?? null);
    setActiveCompanyId(nextCompanyId);
    setActiveBranchId(nextBranchId);
  }, []);

  useEffect(() => {
    let active = true;
    const impersonationMode = window.sessionStorage.getItem("dvcs.impersonationMode") === "true";
    void setPersistence(
      firebaseClient.auth,
      impersonationMode ? browserSessionPersistence : browserLocalPersistence,
    ).catch(() => undefined);
    const unsubscribe = onAuthStateChanged(firebaseClient.auth, async (nextUser) => {
      if (!active) return;
      setLoading(true);
      setError(null);
      setUser(nextUser);
      if (!nextUser) {
        clearTenantState();
        setLoading(false);
        return;
      }
      try {
        await loadTenantState(nextUser);
      } catch (reason) {
        clearTenantState();
        setError(reason instanceof Error ? reason.message : "Unable to load your workspace.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearTenantState, loadTenantState]);

  const selectCompany = useCallback(
    (companyId: string) => {
      if (!companies.some(({ id }) => id === companyId)) return;
      const nextBranchId = branches.find((branch) => branch.companyId === companyId)?.id ?? null;
      setActiveCompanyId(companyId);
      setActiveBranchId(nextBranchId);
      window.localStorage.setItem("dvcs.activeCompanyId", companyId);
      if (nextBranchId) window.localStorage.setItem("dvcs.activeBranchId", nextBranchId);
    },
    [branches, companies],
  );

  const selectBranch = useCallback(
    (branchId: string) => {
      if (!branches.some(({ id, companyId }) => id === branchId && companyId === activeCompanyId))
        return;
      setActiveBranchId(branchId);
      window.localStorage.setItem("dvcs.activeBranchId", branchId);
    },
    [activeCompanyId, branches],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      memberships,
      companies,
      branches,
      subscriptions,
      activeCompany: companies.find(({ id }) => id === activeCompanyId) ?? null,
      activeBranch: branches.find(({ id }) => id === activeBranchId) ?? null,
      activeCompanyId,
      activeBranchId,
      loading,
      error,
      selectCompany,
      selectBranch,
      signOutUser: async () => signOut(firebaseClient.auth),
    }),
    [
      activeBranchId,
      activeCompanyId,
      branches,
      companies,
      error,
      loading,
      memberships,
      profile,
      selectBranch,
      selectCompany,
      subscriptions,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
