"use client";

import { signInWithCustomToken } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient, getFirebaseAppCheckToken } from "@/lib/firebase-client";

type Business = {
  id: string;
  name: string;
  status: string;
  turnover: number;
  collected: number;
  invoiceCount: number;
  memberCount: number;
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
  async function impersonate(account: Account) {
    if (
      !confirm(
        `Open ${account.displayName}'s account? This action is audited and will replace your current Super Admin session.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api("/api/v1/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ targetUserId: account.userId }),
      });
      sessionStorage.setItem(
        "dvcs_impersonation",
        JSON.stringify({ email: result.targetEmail, startedAt: new Date().toISOString() }),
      );
      await signInWithCustomToken(firebaseClient.auth, result.token);
      window.location.href = "/dashboard";
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to open account.");
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
  if (!user || !allowed)
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
  const total = businesses.reduce((sum, item) => sum + item.turnover, 0),
    collected = businesses.reduce((sum, item) => sum + item.collected, 0);
  return (
    <main className="admin-page platform-control">
      <header className="admin-header">
        <div>
          <span className="heading-kicker">Digital Viyabari Control</span>
          <h1>Business Control Centre</h1>
          <p>Turnover, owners and account access in one place.</p>
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
        <article>
          <span>Total Turnover</span>
          <strong>{money.format(total)}</strong>
        </article>
        <article>
          <span>Collected</span>
          <strong>{money.format(collected)}</strong>
        </article>
        <article>
          <span>Accounts</span>
          <strong>{accounts.length}</strong>
        </article>
      </section>
      <section className="platform-businesses">
        <header>
          <div>
            <span className="heading-kicker">Business Performance</span>
            <h2>All Owner Businesses</h2>
          </div>
        </header>
        <div className="platform-table">
          <div className="platform-row platform-row-head">
            <span>Business</span>
            <span>Owner</span>
            <span>Turnover</span>
            <span>Collected</span>
            <span>Invoices</span>
            <span>Team</span>
          </div>
          {businesses.map((item) => (
            <button
              key={item.id}
              className="platform-row"
              onClick={() => setSelectedCompany(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.owners.map((owner) => owner.displayName).join(", ") || "Not Assigned"}
              </span>
              <b>{money.format(item.turnover)}</b>
              <span>{money.format(item.collected)}</span>
              <span>{item.invoiceCount}</span>
              <span>{item.memberCount}</span>
            </button>
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
                <button disabled={busy} onClick={() => void impersonate(account)}>
                  Open Account
                </button>
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
    </main>
  );
}
