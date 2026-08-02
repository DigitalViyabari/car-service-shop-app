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
        <div className="car-loader" aria-hidden="true">
          <svg viewBox="0 0 112 48" role="presentation">
            <path className="car-loader-body" d="M16 31.5h4.5l6.2-13.2c1.1-2.3 3.4-3.8 6-3.8h35.8c2.7 0 5.2 1.2 6.9 3.3l10.8 13.7h7.3c2.5 0 4.5 2 4.5 4.5v2.5H14V34c0-1.4.9-2.5 2-2.5Z" />
            <path className="car-loader-window" d="m32 19-5.2 12.5h23.7v-13H34.2c-1 0-1.8.5-2.2 1.4Zm23.2-.5v13h24L69 20.2a5 5 0 0 0-3.7-1.7H55.2Z" />
            <path className="car-loader-detail" d="M55 18.5v13M14 35.5h84M19 31.5h8M88 31.5h5" />
            <g className="car-loader-wheel"><circle cx="34" cy="37" r="7" /><path d="M34 32v10M29 37h10M30.5 33.5l7 7M37.5 33.5l-7 7" /></g>
            <g className="car-loader-wheel"><circle cx="79" cy="37" r="7" /><path d="M79 32v10M74 37h10M75.5 33.5l7 7M82.5 33.5l-7 7" /></g>
          </svg>
          <div className="car-loader-road"><span /><span /><span /><span /></div>
        </div>
        <h1>Preparing your workshop</h1>
        <p className="muted">Starting the engine and loading your workspace…</p>
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
          <Link href="/dashboard/vehicle-catalogue" className={pathname.startsWith("/dashboard/vehicle-catalogue") ? "is-active" : ""}><NavIcon name="operations" />Vehicle Catalogue</Link>
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
