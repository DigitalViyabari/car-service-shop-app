"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAppCheckToken } from "@/lib/firebase-client";

type Business = {
  id: string;
  name: string;
  status: string;
  turnover?: number;
  collected?: number;
  invoiceCount?: number;
  memberCount: number;
  subscription: {
    plan: "trial" | "monthly" | "yearly";
    status: string;
    currentPeriodEnd: string | null;
    branchCount: number;
  } | null;
  branches: Array<{
    id: string;
    name: string;
    status: string;
    subscription: {
      plan: "trial" | "monthly" | "yearly";
      status: string;
      currentPeriodEnd: string | null;
    } | null;
  }>;
  owners: { userId: string; displayName: string; email: string }[];
};
type Account = {
  userId: string;
  companyId: string;
  displayName: string;
  email: string;
  companyRoles: string[];
  branchAssignments: { branchId: string; roles: string[] }[];
  status: string;
};
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function PlatformAdminPage() {
  const { user, loading } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [selectedCompany, setSelectedCompany] = useState("all"),
    [message, setMessage] = useState(""),
    [accessChecked, setAccessChecked] = useState(false),
    [platformRoles, setPlatformRoles] = useState<string[]>([]);
  const [admin, setAdmin] = useState({ displayName: "", email: "", temporaryPassword: "" }),
    [companyDraft, setCompanyDraft] = useState({
      companyName: "",
      branchName: "Main Branch",
      ownerName: "",
      ownerEmail: "",
      temporaryPassword: "",
      billingCycle: "monthly",
      trialDays: 30,
    }),
    [branchDraft, setBranchDraft] = useState({
      companyId: "",
      branchName: "",
      plan: "trial" as "trial" | "monthly" | "yearly",
      trialDays: 30,
    }),
    [subscriptionDraft, setSubscriptionDraft] = useState<{
      companyId: string;
      companyName: string;
      branchId?: string;
      branchName?: string;
      branchStatus?: string;
      plan: "trial" | "monthly" | "yearly";
      trialDays: number;
    } | null>(null),
    [passwordDraft, setPasswordDraft] = useState<{
      account: Account;
      temporaryPassword: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const allowed = platformRoles.some((role) =>
      ["platform_super_admin", "platform_support_admin"].includes(role),
    ),
    superAdmin = platformRoles.includes("platform_super_admin");
  async function api(path: string, options: RequestInit = {}) {
    if (!user) throw new Error("Authentication is required.");
    const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]);
    const response = await fetch(path, {
        ...options,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-firebase-appcheck": appCheck,
          ...options.headers,
        },
      }),
      result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Request failed.");
    return result;
  }
  useEffect(() => {
    if (!user) return;
    void api("/api/v1/admin/overview")
      .then((result) => {
        setBusinesses(result.companies ?? []);
        setAccounts(result.accounts ?? []);
        setPlatformRoles(result.platformRoles ?? []);
      })
      .catch((reason) => setMessage(reason.message))
      .finally(() => setAccessChecked(true));
  }, [user]);
  const visibleAccounts = useMemo(
    () =>
      accounts.filter((item) => selectedCompany === "all" || item.companyId === selectedCompany),
    [accounts, selectedCompany],
  );
  async function createAdmin() {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/admin/create", { method: "POST", body: JSON.stringify(admin) });
      setAdmin({ displayName: "", email: "", temporaryPassword: "" });
      setMessage("Support Admin created successfully.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create admin.");
    } finally {
      setBusy(false);
    }
  }
  async function createCompany() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/api/v1/admin/companies", {
        method: "POST",
        body: JSON.stringify({ ...companyDraft, trialDays: Number(companyDraft.trialDays) }),
      });
      setCompanyDraft({
        companyName: "",
        branchName: "Main Branch",
        ownerName: "",
        ownerEmail: "",
        temporaryPassword: "",
        billingCycle: "monthly",
        trialDays: 30,
      });
      setMessage(
        `Company created. Subscription is ${result.subscriptionStatus} until ${new Date(result.currentPeriodEnd).toLocaleDateString("en-IN")}.`,
      );
      const overview = await api("/api/v1/admin/overview");
      setBusinesses(overview.companies ?? []);
      setAccounts(overview.accounts ?? []);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create company.");
    } finally {
      setBusy(false);
    }
  }
  async function refreshOverview() {
    const overview = await api("/api/v1/admin/overview");
    setBusinesses(overview.companies ?? []);
    setAccounts(overview.accounts ?? []);
  }
  async function createBranch() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/api/v1/admin/branches", {
        method: "POST",
        body: JSON.stringify({ ...branchDraft, trialDays: Number(branchDraft.trialDays) }),
      });
      setBranchDraft({ companyId: "", branchName: "", plan: "trial", trialDays: 30 });
      await refreshOverview();
      setMessage(
        `Branch created with ${result.plan} access until ${new Date(result.currentPeriodEnd).toLocaleDateString("en-IN")}.`,
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create branch.");
    } finally {
      setBusy(false);
    }
  }
  async function updateSubscription() {
    if (!subscriptionDraft) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/api/v1/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          companyId: subscriptionDraft.companyId,
          branchId: subscriptionDraft.branchId,
          plan: subscriptionDraft.plan,
          trialDays: Number(subscriptionDraft.trialDays),
        }),
      });
      const companyName = subscriptionDraft.branchName
        ? `${subscriptionDraft.companyName} · ${subscriptionDraft.branchName}`
        : subscriptionDraft.companyName;
      setSubscriptionDraft(null);
      await refreshOverview();
      setMessage(
        `${companyName} changed to ${result.plan}. Access is valid until ${new Date(result.currentPeriodEnd).toLocaleDateString("en-IN")}.`,
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update subscription.");
    } finally {
      setBusy(false);
    }
  }
  async function updateBranchAccess(action: "activate" | "suspend") {
    if (!subscriptionDraft?.branchId) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/admin/branches/access", {
        method: "POST",
        body: JSON.stringify({
          companyId: subscriptionDraft.companyId,
          branchId: subscriptionDraft.branchId,
          action,
        }),
      });
      const label = `${subscriptionDraft.companyName} · ${subscriptionDraft.branchName}`;
      setSubscriptionDraft(null);
      await refreshOverview();
      setMessage(`${label} ${action === "suspend" ? "access suspended" : "access activated"}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update branch access.");
    } finally {
      setBusy(false);
    }
  }
  async function impersonate(account: Account) {
    if (
      !confirm(
        `Open ${account.displayName}'s account? This action is audited and will replace your current Super Admin session.`,
      )
    )
      return;
    const channel = crypto.randomUUID(),
      impersonationTab = window.open(
        `/admin/impersonate?channel=${encodeURIComponent(channel)}`,
        "_blank",
      );
    if (!impersonationTab) {
      setMessage("Allow pop-ups for this site, then try Open Account again.");
      return;
    }
    setBusy(true);
    setMessage("");
    let token = "",
      ready = false;
    const deliver = () => {
        if (!ready || !token || impersonationTab.closed) return;
        impersonationTab.postMessage(
          {
            type: "dvcs-impersonation-token",
            channel,
            token,
            email: account.email,
          },
          window.location.origin,
        );
      },
      receiveReady = (event: MessageEvent) => {
        if (
          event.origin === window.location.origin &&
          event.source === impersonationTab &&
          event.data?.type === "dvcs-impersonation-ready" &&
          event.data?.channel === channel
        ) {
          ready = true;
          deliver();
        }
      };
    window.addEventListener("message", receiveReady);
    try {
      const result = await api("/api/v1/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ targetUserId: account.userId }),
      });
      token = result.token;
      deliver();
    } catch (reason) {
      impersonationTab.close();
      setMessage(reason instanceof Error ? reason.message : "Unable to open account.");
    } finally {
      window.setTimeout(() => window.removeEventListener("message", receiveReady), 30_000);
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!passwordDraft) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/admin/reset-password", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: passwordDraft.account.userId,
          temporaryPassword: passwordDraft.temporaryPassword,
        }),
      });
      const email = passwordDraft.account.email;
      setPasswordDraft(null);
      setMessage(`Temporary password updated for ${email}. Share it securely with the user.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  }
  if (loading || (user && !accessChecked))
    return (
      <main className="state-page">
        <div className="car-loader" />
        <h1>Loading Platform</h1>
      </main>
    );
  if (!user)
    return (
      <main className="state-page">
        <div className="state-card">
          <h1>Platform Sign-In Required</h1>
          <p>Sign in with an authorised Super Admin or Support Admin account.</p>
          <a className="dv-button" href="/admin/login">
            Open Admin Login
          </a>
        </div>
      </main>
    );
  if (!allowed)
    return (
      <main className="state-page">
        <div className="state-card">
          <h1>Platform Admin Access Required</h1>
          <p>This page is restricted to authorised Digital Viyabari administrators.</p>
          {user ? (
            <div className="admin-access-diagnostic">
              <strong>Signed-In Account</strong>
              <span>{user.email ?? "No email"}</span>
              <small>UID: {user.uid}</small>
              {message ? <p>{message}</p> : null}
            </div>
          ) : null}
          <button className="dv-button" onClick={() => window.location.reload()}>
            Check Access Again
          </button>
        </div>
      </main>
    );
  const total = businesses.reduce((sum, item) => sum + (item.turnover ?? 0), 0),
    collected = businesses.reduce((sum, item) => sum + (item.collected ?? 0), 0),
    activeBusinesses = businesses.filter(({ status }) => status === "active").length,
    ownerCount = businesses.reduce((sum, item) => sum + item.owners.length, 0);
  return (
    <main className="admin-page platform-control">
      <header className="admin-header">
        <div>
          <span className="heading-kicker">Digital Viyabari Control</span>
          <h1>Business Control Centre</h1>
          <p>
            {superAdmin
              ? "Subscriptions, business performance and platform access."
              : "Owner accounts, subscriptions and customer support operations."}
          </p>
          <span className="platform-role-chip">{superAdmin ? "Super Admin" : "Support Admin"}</span>
        </div>
        <div className="admin-header-links">
          <a href="/admin/communications">Communications</a>
          <a href="/dashboard">Workspace</a>
        </div>
      </header>
      {message ? <div className="alert admin-message">{message}</div> : null}
      <section className="platform-summary">
        <article>
          <span>Total Businesses</span>
          <strong>{businesses.length}</strong>
        </article>
        {superAdmin ? (
          <>
            <article className="is-finance">
              <span>Total Turnover</span>
              <strong>{money.format(total)}</strong>
            </article>
            <article className="is-positive">
              <span>Collected</span>
              <strong>{money.format(collected)}</strong>
            </article>
          </>
        ) : (
          <>
            <article className="is-positive">
              <span>Active Businesses</span>
              <strong>{activeBusinesses}</strong>
            </article>
            <article>
              <span>Business Owners</span>
              <strong>{ownerCount}</strong>
            </article>
          </>
        )}
        <article>
          <span>Accounts</span>
          <strong>{accounts.length}</strong>
        </article>
      </section>
      <section className="platform-company-create">
        <header>
          <div>
            <span className="heading-kicker">New Subscription</span>
            <h2>Create Company &amp; Owner</h2>
            <p>Creates the company, Main Branch, owner login and billing period together.</p>
          </div>
        </header>
        <div className="form-grid">
          <label>
            Company Name
            <input
              value={companyDraft.companyName}
              onChange={(e) => setCompanyDraft({ ...companyDraft, companyName: e.target.value })}
            />
          </label>
          <label>
            Branch Name
            <input
              value={companyDraft.branchName}
              onChange={(e) => setCompanyDraft({ ...companyDraft, branchName: e.target.value })}
            />
          </label>
          <label>
            Owner Name
            <input
              value={companyDraft.ownerName}
              onChange={(e) => setCompanyDraft({ ...companyDraft, ownerName: e.target.value })}
            />
          </label>
          <label>
            Owner Email
            <input
              type="email"
              value={companyDraft.ownerEmail}
              onChange={(e) => setCompanyDraft({ ...companyDraft, ownerEmail: e.target.value })}
            />
          </label>
          <label>
            Temporary Password
            <input
              type="password"
              value={companyDraft.temporaryPassword}
              onChange={(e) =>
                setCompanyDraft({ ...companyDraft, temporaryPassword: e.target.value })
              }
            />
          </label>
          <label>
            Billing Cycle
            <select
              value={companyDraft.billingCycle}
              onChange={(e) => setCompanyDraft({ ...companyDraft, billingCycle: e.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            Trial Period (Days)
            <input
              type="number"
              min="0"
              max="365"
              value={companyDraft.trialDays}
              onChange={(e) =>
                setCompanyDraft({ ...companyDraft, trialDays: Number(e.target.value) })
              }
            />
            <small>Enter 0 to activate billing immediately.</small>
          </label>
          <button
            className="dv-button"
            disabled={
              busy ||
              !companyDraft.companyName ||
              !companyDraft.ownerName ||
              !companyDraft.ownerEmail ||
              companyDraft.temporaryPassword.length < 8
            }
            onClick={() => void createCompany()}
          >
            {busy ? "Creating…" : "Create Company"}
          </button>
        </div>
      </section>
      <section className="platform-company-create platform-branch-create">
        <header>
          <div>
            <span className="heading-kicker">Additional Paid Branch</span>
            <h2>Add Branch To Existing Company</h2>
            <p>Each branch receives its own access period and subscription.</p>
          </div>
        </header>
        <div className="form-grid">
          <label>
            Company
            <select
              value={branchDraft.companyId}
              onChange={(event) =>
                setBranchDraft({ ...branchDraft, companyId: event.target.value })
              }
            >
              <option value="">Select Company</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Branch Name
            <input
              value={branchDraft.branchName}
              placeholder="Example: Anna Nagar Branch"
              onChange={(event) =>
                setBranchDraft({ ...branchDraft, branchName: event.target.value })
              }
            />
          </label>
          <label>
            Subscription
            <select
              value={branchDraft.plan}
              onChange={(event) =>
                setBranchDraft({
                  ...branchDraft,
                  plan: event.target.value as "trial" | "monthly" | "yearly",
                })
              }
            >
              <option value="trial">Trial</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {branchDraft.plan === "trial" ? (
            <label>
              Trial Days
              <input
                type="number"
                min="1"
                max="365"
                value={branchDraft.trialDays}
                onChange={(event) =>
                  setBranchDraft({ ...branchDraft, trialDays: Number(event.target.value) })
                }
              />
            </label>
          ) : null}
          <button
            className="dv-button"
            disabled={busy || !branchDraft.companyId || branchDraft.branchName.trim().length < 2}
            onClick={() => void createBranch()}
          >
            {busy ? "Creating…" : "Create Branch"}
          </button>
        </div>
      </section>
      <section className="platform-businesses">
        <header>
          <div>
            <span className="heading-kicker">
              {superAdmin ? "Business Performance" : "Business Directory"}
            </span>
            <h2>{superAdmin ? "All Owner Businesses" : "Supported Businesses"}</h2>
          </div>
        </header>
        <div className="platform-table">
          <div
            className={`platform-row platform-row-head ${superAdmin ? "" : "platform-row--support"}`}
          >
            <span>Business</span>
            <span>Owner</span>
            {superAdmin ? <span>Turnover</span> : <span>Status</span>}
            {superAdmin ? <span>Collected</span> : null}
            {superAdmin ? <span>Invoices</span> : null}
            <span>Team</span>
            <span>Subscription</span>
          </div>
          {businesses.map((item) => (
            <div
              key={item.id}
              className={`platform-row ${superAdmin ? "" : "platform-row--support"}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCompany(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedCompany(item.id);
              }}
            >
              <strong>{item.name}</strong>
              <span>
                {item.owners.map((owner) => owner.displayName).join(", ") || "Not Assigned"}
              </span>
              {superAdmin ? <b>{money.format(item.turnover ?? 0)}</b> : <span>{item.status}</span>}
              {superAdmin ? <span>{money.format(item.collected ?? 0)}</span> : null}
              {superAdmin ? <span>{item.invoiceCount ?? 0}</span> : null}
              <span>{item.memberCount}</span>
              <span className="platform-subscription-cell">
                <b>{item.subscription?.plan ?? "Not Set"}</b>
                <small>
                  {item.subscription?.currentPeriodEnd
                    ? `Until ${new Date(item.subscription.currentPeriodEnd).toLocaleDateString("en-IN")}`
                    : "No billing period"}
                </small>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSubscriptionDraft({
                      companyId: item.id,
                      companyName: item.name,
                      plan: item.subscription?.plan ?? "trial",
                      trialDays: 30,
                    });
                  }}
                >
                  Manage All
                </button>
                <span className="platform-branch-manage-list">
                  {(item.branches ?? []).map((branch) => (
                    <button
                      type="button"
                      key={branch.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSubscriptionDraft({
                          companyId: item.id,
                          companyName: item.name,
                          branchId: branch.id,
                          branchName: branch.name,
                          branchStatus: branch.status,
                          plan: branch.subscription?.plan ?? "trial",
                          trialDays: 30,
                        });
                      }}
                    >
                      {branch.name} · {branch.subscription?.plan ?? "Not Set"} · {branch.status}
                    </button>
                  ))}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="platform-accounts">
        <header>
          <div>
            <span className="heading-kicker">Account Access</span>
            <h2>Owners, Managers &amp; Staff</h2>
          </div>
          <select
            value={selectedCompany}
            onChange={(event) => setSelectedCompany(event.target.value)}
          >
            <option value="all">All Businesses</option>
            {businesses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </header>
        <div className="account-grid">
          {visibleAccounts.map((account) => (
            <article key={`${account.userId}_${account.companyId}`}>
              <div>
                <strong>{account.displayName}</strong>
                <span>{account.email}</span>
                <small>
                  {[
                    ...account.companyRoles,
                    ...account.branchAssignments.flatMap((item) => item.roles),
                  ].join(" · ") || "Team Member"}
                </small>
              </div>
              {superAdmin ? (
                <div className="account-actions">
                  <button
                    disabled={busy}
                    onClick={() => setPasswordDraft({ account, temporaryPassword: "" })}
                  >
                    Set Password
                  </button>
                  <button disabled={busy} onClick={() => void impersonate(account)}>
                    Open Account
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      {superAdmin ? (
        <section className="platform-admin-create">
          <div>
            <span className="heading-kicker">Platform Team</span>
            <h2>Create Support Admin</h2>
            <p>
              Can monitor and manage owner businesses. Account impersonation remains Super Admin
              only.
            </p>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input
                value={admin.displayName}
                onChange={(e) => setAdmin({ ...admin, displayName: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={admin.email}
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
              />
            </label>
            <label>
              Temporary Password
              <input
                type="password"
                value={admin.temporaryPassword}
                onChange={(e) => setAdmin({ ...admin, temporaryPassword: e.target.value })}
              />
            </label>
            <button
              className="dv-button"
              disabled={
                busy || !admin.displayName || !admin.email || admin.temporaryPassword.length < 8
              }
              onClick={() => void createAdmin()}
            >
              Create Support Admin
            </button>
          </div>
        </section>
      ) : null}
      {subscriptionDraft ? (
        <div className="modal-backdrop" role="presentation">
          <section className="module-modal subscription-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Manual Subscription</span>
                <h2>
                  {subscriptionDraft.companyName}
                  {subscriptionDraft.branchName
                    ? ` · ${subscriptionDraft.branchName}`
                    : " · All Branches"}
                </h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSubscriptionDraft(null)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label className="span-2">
                Subscription Type
                <select
                  value={subscriptionDraft.plan}
                  onChange={(event) =>
                    setSubscriptionDraft({
                      ...subscriptionDraft,
                      plan: event.target.value as "trial" | "monthly" | "yearly",
                    })
                  }
                >
                  <option value="trial">Trial</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              {subscriptionDraft.plan === "trial" ? (
                <label className="span-2">
                  Trial Days
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={subscriptionDraft.trialDays}
                    onChange={(event) =>
                      setSubscriptionDraft({
                        ...subscriptionDraft,
                        trialDays: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ) : null}
              <p className="span-2 subscription-note">
                {subscriptionDraft.branchId
                  ? "Updates this branch and starts a new billing period today."
                  : "Updates every branch and starts a new billing period today."}
              </p>
            </div>
            <footer className="modal-footer subscription-actions">
              {subscriptionDraft.branchId ? (
                <button
                  className={
                    subscriptionDraft.branchStatus === "suspended"
                      ? "cancel-button"
                      : "danger-button"
                  }
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void updateBranchAccess(
                      subscriptionDraft.branchStatus === "suspended" ? "activate" : "suspend",
                    )
                  }
                >
                  {subscriptionDraft.branchStatus === "suspended"
                    ? "Activate Branch"
                    : "Suspend Branch Access"}
                </button>
              ) : null}
              <button
                className="cancel-button"
                type="button"
                onClick={() => setSubscriptionDraft(null)}
              >
                Cancel
              </button>
              <button
                className="dv-button"
                type="button"
                disabled={busy}
                onClick={() => void updateSubscription()}
              >
                {busy ? "Updating…" : "Apply Subscription"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {passwordDraft ? (
        <div className="modal-backdrop" role="presentation">
          <section className="module-modal subscription-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Secure Login Reset</span>
                <h2>{passwordDraft.account.displayName}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setPasswordDraft(null)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label className="span-2">
                Login Email
                <input value={passwordDraft.account.email} readOnly />
              </label>
              <label className="span-2">
                New Temporary Password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordDraft.temporaryPassword}
                  onChange={(event) =>
                    setPasswordDraft({ ...passwordDraft, temporaryPassword: event.target.value })
                  }
                />
              </label>
              <p className="span-2 subscription-note">
                Existing passwords cannot be viewed. This replaces it with a new temporary password.
              </p>
            </div>
            <footer className="modal-footer">
              <button
                className="cancel-button"
                type="button"
                onClick={() => setPasswordDraft(null)}
              >
                Cancel
              </button>
              <button
                className="dv-button"
                type="button"
                disabled={busy || passwordDraft.temporaryPassword.length < 8}
                onClick={() => void resetPassword()}
              >
                {busy ? "Updating…" : "Set New Password"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
