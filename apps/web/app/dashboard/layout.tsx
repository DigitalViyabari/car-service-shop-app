"use client";

import { StatusBadge } from "@dvcs/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAppCheckToken } from "@/lib/firebase-client";

type WorkspaceNotification = {
  id: string;
  type: "job_assigned" | "delay_reported";
  message: string;
  jobId: string;
  createdAt?: { _seconds?: number; seconds?: number };
};

function NavIcon({
  name,
}: {
  name:
    | "overview"
    | "operations"
    | "inventory"
    | "finance"
    | "reports"
    | "team"
    | "communications"
    | "settings";
}) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    operations: (
      <>
        <path d="M4 15.5 6.5 9h11l2.5 6.5" />
        <path d="M3 15.5h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z" />
        <circle cx="7" cy="17.5" r="1" />
        <circle cx="17" cy="17.5" r="1" />
      </>
    ),
    inventory: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7v10l8 4 8-4V7M12 11v10" />
      </>
    ),
    finance: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    reports: (
      <>
        <path d="M5 21V10M12 21V3M19 21v-7" />
        <path d="M3 21h18" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0M14 15.5a4 4 0 0 1 6.5 3.1" />
      </>
    ),
    communications: (
      <>
        <path d="M4 5h16v11H8l-4 4V5Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const {
    user,
    profile,
    memberships,
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

  async function openNotification(notification: WorkspaceNotification) {
    if (!user || !activeCompanyId || !activeBranchId) return;
    setNotifications((items) => items.filter(({ id }) => id !== notification.id));
    setShowNotifications(false);
    router.push(`/dashboard/jobs?jobId=${notification.jobId}`);
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]);
      await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-firebase-appcheck": appCheck,
        },
        body: JSON.stringify({
          companyId: activeCompanyId,
          branchId: activeBranchId,
          notificationId: notification.id,
        }),
      });
    } catch {
      // The next refresh restores the notification when the read request fails.
    }
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, router, user]);
  useEffect(() => {
    if (loading || !activeCompanyId || !activeBranchId || pathname !== "/dashboard") return;
    const membership = memberships.find(({ companyId }) => companyId === activeCompanyId),
      roles =
        membership?.branchAssignments.find(({ branchId }) => branchId === activeBranchId)?.roles ??
        [],
      technicianOnly =
        roles.includes("technician") &&
        !(membership?.companyRoles ?? []).length &&
        roles.every((role) => role === "technician");
    if (technicianOnly) router.replace("/dashboard/jobs");
  }, [activeBranchId, activeCompanyId, loading, memberships, pathname, router]);
  useEffect(() => {
    if (!user || !activeCompanyId || !activeBranchId) return;
    const currentUser = user;
    let cancelled = false;
    async function loadNotifications() {
      try {
        const [token, appCheck] = await Promise.all([
            currentUser.getIdToken(),
            getFirebaseAppCheckToken(),
          ]),
          response = await fetch(
            `/api/v1/notifications?companyId=${encodeURIComponent(activeCompanyId!)}&branchId=${encodeURIComponent(activeBranchId!)}`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                "x-firebase-appcheck": appCheck,
              },
            },
          ),
          result = (await response.json()) as { notifications?: WorkspaceNotification[] };
        if (!cancelled && response.ok) setNotifications(result.notifications ?? []);
      } catch {
        if (!cancelled) setNotifications([]);
      }
    }
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeBranchId, activeCompanyId, user]);

  if (loading) {
    return (
      <main className="state-page" aria-live="polite">
        <div className="car-loader" aria-hidden="true" />
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
  const subscriptionEndValue = subscription?.currentPeriodEnd as unknown,
    subscriptionEnd =
      typeof subscriptionEndValue === "string"
        ? new Date(subscriptionEndValue)
        : subscriptionEndValue &&
            typeof subscriptionEndValue === "object" &&
            "toDate" in subscriptionEndValue
          ? (subscriptionEndValue as { toDate: () => Date }).toDate()
          : null,
    subscriptionExpired =
      !subscription ||
      ["expired", "suspended", "cancelled", "past_due"].includes(subscription.status) ||
      Boolean(subscriptionEnd && subscriptionEnd.getTime() < Date.now()),
    subscriptionTone =
      !subscriptionExpired && subscription?.status === "active" ? "positive" : "warning";
  const activeMembership = memberships.find(({ companyId }) => companyId === activeCompanyId);
  const isCompanyOwner = activeMembership?.companyRoles.includes("company_owner") ?? false;
  const activeBranchRoles =
    activeMembership?.branchAssignments.find(({ branchId }) => branchId === activeBranchId)
      ?.roles ?? [];
  const technicianOnly =
    activeBranchRoles.includes("technician") &&
    !(activeMembership?.companyRoles ?? []).length &&
    activeBranchRoles.every((role) => role === "technician");
  const canAccessFinance =
    (activeMembership?.companyRoles ?? []).some((role) =>
      ["company_owner", "company_admin", "company_accountant"].includes(role),
    ) ||
    (activeMembership?.branchAssignments ?? []).some(
      ({ branchId, roles }) =>
        branchId === activeBranchId &&
        roles.some((role) => role === "branch_manager" || role === "finance_manager"),
    );
  const canAccessInventory =
    (activeMembership?.companyRoles ?? []).some(
      (role) => role === "company_owner" || role === "company_admin",
    ) ||
    (activeMembership?.branchAssignments ?? []).some(
      ({ branchId, roles }) =>
        branchId === activeBranchId &&
        roles.some((role) => role === "branch_manager" || role === "inventory_manager"),
    );

  if (subscriptionExpired) {
    return (
      <main className="state-page">
        <div className="state-card">
          <StatusBadge tone="warning">Subscription Ended</StatusBadge>
          <h1>Workshop access is paused</h1>
          <p>The company subscription needs to be renewed by Digital Viyabari.</p>
          {subscriptionEnd ? (
            <p className="muted">Access ended on {subscriptionEnd.toLocaleDateString("en-IN")}.</p>
          ) : null}
          <button className="link-button" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  async function handleSignOut() {
    setShowLogoutConfirmation(false);
    await signOutUser();
    router.replace("/");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/digital-viyabari-logo.png" alt="Digital Viyabari" />
          <small>Car Service App</small>
        </div>
        <div className="nav-label">Workshop control</div>
        <nav className="nav" aria-label="Primary navigation">
          {!technicianOnly ? (
            <Link href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""}>
              <NavIcon name="overview" />
              Overview
            </Link>
          ) : null}
          <Link
            href="/dashboard/jobs"
            className={pathname.startsWith("/dashboard/jobs") ? "is-active" : ""}
          >
            <NavIcon name="operations" />
            Job Cards
          </Link>
          {!technicianOnly ? (
            <Link
              href="/dashboard/customers"
              className={pathname.startsWith("/dashboard/customers") ? "is-active" : ""}
            >
              <NavIcon name="team" />
              Customers
            </Link>
          ) : null}
          {canAccessFinance ? (
            <Link
              href="/dashboard/invoices"
              className={pathname.startsWith("/dashboard/invoices") ? "is-active" : ""}
            >
              <NavIcon name="finance" />
              Invoices &amp; Payments
            </Link>
          ) : null}
          {canAccessInventory ? (
            <Link
              href="/dashboard/products"
              className={pathname.startsWith("/dashboard/products") ? "is-active" : ""}
            >
              <NavIcon name="inventory" />
              Inventory
            </Link>
          ) : null}
          {canAccessInventory || canAccessFinance ? (
            <Link
              href="/dashboard/procurement"
              className={pathname.startsWith("/dashboard/procurement") ? "is-active" : ""}
            >
              <NavIcon name="finance" />
              Purchases &amp; Expenses
            </Link>
          ) : null}
          {canAccessFinance ? (
            <Link
              href="/dashboard/reports"
              className={pathname.startsWith("/dashboard/reports") ? "is-active" : ""}
            >
              <NavIcon name="reports" />
              Reports
            </Link>
          ) : null}
          {!technicianOnly ? (
            <Link
              href="/dashboard/team"
              className={pathname.startsWith("/dashboard/team") ? "is-active" : ""}
            >
              <NavIcon name="team" />
              Team
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar" aria-hidden="true">
            {profile.displayName?.charAt(0).toUpperCase() || "D"}
          </div>
          <span>{profile.displayName}</span>
          <small>{profile.email}</small>
          <button
            className="sidebar-logout"
            onClick={() => setShowLogoutConfirmation(true)}
            aria-label="Log out"
          >
            Log Out
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          {!technicianOnly ? (
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
                {companyBranches.length === 0 ? (
                  <option value="">No assigned branches</option>
                ) : null}
                {companyBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <strong className="technician-workspace-title">My Assigned Work</strong>
          )}
          <div className="topbar-status">
            {!technicianOnly ? (
              <span className="current-branch">{activeBranch?.name ?? "No branch selected"}</span>
            ) : null}
            {!technicianOnly ? (
              <StatusBadge tone={subscription ? subscriptionTone : "neutral"}>
                {subscription
                  ? `Subscription ${subscription.status.replaceAll("_", " ")}`
                  : "No subscription"}
              </StatusBadge>
            ) : null}
            {isCompanyOwner ? (
              <Link className="topbar-settings" href="/dashboard/settings" aria-label="Settings">
                <NavIcon name="settings" />
              </Link>
            ) : null}
            <div className="notification-center">
              <button
                type="button"
                className="notification-bell"
                aria-label="Notifications"
                aria-expanded={showNotifications}
                onClick={() => setShowNotifications((value) => !value)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                </svg>
                {notifications.length ? <span>{Math.min(notifications.length, 9)}</span> : null}
              </button>
              {showNotifications ? (
                <section className="notification-panel">
                  <header>
                    <strong>Notifications</strong>
                    <small>{notifications.length} Recent</small>
                  </header>
                  {notifications.length ? (
                    notifications.map((notification) => (
                      <button
                        type="button"
                        key={notification.id}
                        onClick={() => void openNotification(notification)}
                      >
                        <i className={`notification-type ${notification.type}`} />
                        <span>{notification.message}</span>
                      </button>
                    ))
                  ) : (
                    <p>No new notifications.</p>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </header>
        {technicianOnly && !pathname.startsWith("/dashboard/jobs") ? null : children}
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {!technicianOnly ? (
          <Link href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""}>
            Home
          </Link>
        ) : null}
        {!technicianOnly ? (
          <Link
            href="/dashboard/customers"
            className={pathname.startsWith("/dashboard/customers") ? "is-active" : ""}
          >
            Customers
          </Link>
        ) : null}
        <Link
          href="/dashboard/jobs"
          className={pathname.startsWith("/dashboard/jobs") ? "is-active" : ""}
        >
          Jobs
        </Link>
        <button onClick={() => setShowLogoutConfirmation(true)}>Log Out</button>
      </nav>
      {showLogoutConfirmation ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="module-modal logout-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
          >
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Account Security</span>
                <h2 id="logout-title">Are You Sure You Want To Log Out?</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutConfirmation(false)}
                aria-label="Close logout confirmation"
              >
                ×
              </button>
            </header>
            <p className="muted">You will need to sign in again to access your workshop.</p>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowLogoutConfirmation(false)}
              >
                Stay Signed In
              </button>
              <button type="button" className="dv-button" onClick={() => void handleSignOut()}>
                Yes, Log Out
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
