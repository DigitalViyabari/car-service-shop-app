"use client";

import { StatusBadge } from "@dvcs/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    user,
    profile,
    companies,
    branches,
    subscriptions,
    activeCompanyId,
    activeBranchId,
    activeBranch,
    loading,
    error,
    selectCompany,
    selectBranch,
    signOutUser,
  } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, router, user]);

  if (loading) {
    return (
      <main className="state-page" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h1>Loading your workspace</h1>
        <p className="muted">Checking your company and branch access…</p>
      </main>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <main className="state-page">
        <div className="state-card">
          <h1>Workspace unavailable</h1>
          <p>{error}</p>
          <button className="link-button" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  if (!profile || companies.length === 0) {
    return (
      <main className="state-page">
        <div className="state-card">
          <StatusBadge tone="warning">Setup required</StatusBadge>
          <h1>Your account is authenticated</h1>
          <p>
            No active company membership has been assigned to <strong>{user.email}</strong> yet.
          </p>
          <p className="muted">Ask the platform administrator to complete your owner profile.</p>
          <button className="link-button" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  const companyBranches = branches.filter(({ companyId }) => companyId === activeCompanyId);
  const subscription = subscriptions.find(({ branchId }) => branchId === activeBranchId);
  const subscriptionTone = subscription?.status === "active" ? "positive" : "warning";

  async function handleSignOut() {
    await signOutUser();
    router.replace("/");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          DIGITAL <span>VIYABARI</span>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          <Link href="/dashboard">Overview</Link>
          <span aria-disabled="true">Operations</span>
          <span aria-disabled="true">Inventory</span>
          <span aria-disabled="true">Finance</span>
          <span aria-disabled="true">Reports</span>
          <span aria-disabled="true">Team</span>
          <span aria-disabled="true">Settings</span>
        </nav>
        <div className="sidebar-user">
          <span>{profile.displayName}</span>
          <small>{profile.email}</small>
          <button onClick={() => void handleSignOut()}>Sign out</button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="selectors">
            <label className="sr-only" htmlFor="company-selector">
              Company
            </label>
            <select
              id="company-selector"
              aria-label="Company"
              value={activeCompanyId ?? ""}
              onChange={(event) => selectCompany(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="branch-selector">
              Branch
            </label>
            <select
              id="branch-selector"
              aria-label="Branch"
              value={activeBranchId ?? ""}
              onChange={(event) => selectBranch(event.target.value)}
              disabled={companyBranches.length === 0}
            >
              {companyBranches.length === 0 ? <option value="">No assigned branches</option> : null}
              {companyBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="topbar-status">
            <span className="current-branch">{activeBranch?.name ?? "No branch selected"}</span>
            <StatusBadge tone={subscription ? subscriptionTone : "neutral"}>
              {subscription
                ? `Subscription ${subscription.status.replaceAll("_", " ")}`
                : "No subscription"}
            </StatusBadge>
          </div>
        </header>
        {children}
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/dashboard">Home</Link>
        <span>Jobs</span>
        <span>Stock</span>
        <button onClick={() => void handleSignOut()}>Sign out</button>
      </nav>
    </div>
  );
}
