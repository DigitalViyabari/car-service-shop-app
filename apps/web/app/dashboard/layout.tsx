"use client";

import { StatusBadge } from "@dvcs/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

function NavIcon({ name }: { name: "overview" | "operations" | "inventory" | "finance" | "reports" | "team" | "settings" }) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    operations: <><path d="M4 15.5 6.5 9h11l2.5 6.5"/><path d="M3 15.5h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z"/><circle cx="7" cy="17.5" r="1"/><circle cx="17" cy="17.5" r="1"/></>,
    inventory: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></>,
    finance: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></>,
    reports: <><path d="M5 21V10M12 21V3M19 21v-7"/><path d="M3 21h18"/></>,
    team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M14 15.5a4 4 0 0 1 6.5 3.1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
          <i className="brand-mark" aria-hidden="true" />
          <div>DIGITAL <span>VIYABARI</span></div>
        </div>
        <div className="nav-label">Workshop control</div>
        <nav className="nav" aria-label="Primary navigation">
          <Link href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""}><NavIcon name="overview" />Overview</Link>
          <span aria-disabled="true"><NavIcon name="operations" />Operations</span>
          <Link href="/dashboard/customers" className={pathname.startsWith("/dashboard/customers") ? "is-active" : ""}><NavIcon name="team" />Customers</Link>
          <span aria-disabled="true"><NavIcon name="inventory" />Inventory</span>
          <span aria-disabled="true"><NavIcon name="finance" />Finance</span>
          <span aria-disabled="true"><NavIcon name="reports" />Reports</span>
          <span aria-disabled="true"><NavIcon name="team" />Team</span>
          <span aria-disabled="true"><NavIcon name="settings" />Settings</span>
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar" aria-hidden="true">{profile.displayName?.charAt(0).toUpperCase() || "D"}</div>
          <span>{profile.displayName}</span>
          <small>{profile.email}</small>
          <button onClick={() => void handleSignOut()} aria-label="Sign out" title="Sign out">↗</button>
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
        <Link href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""}>Home</Link>
        <Link href="/dashboard/customers" className={pathname.startsWith("/dashboard/customers") ? "is-active" : ""}>Customers</Link>
        <span>Jobs</span>
        <button onClick={() => void handleSignOut()}>Sign out</button>
      </nav>
    </div>
  );
}
