"use client";
import type { BranchRole } from "@dvcs/types";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAppCheckToken } from "@/lib/firebase-client";
type Member = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  companyRoles: string[];
  branchAssignments: { branchId: string; roles: BranchRole[] }[];
  status: "active" | "disabled" | "deleted";
};
const roles: Array<[BranchRole, string]> = [
  ["branch_manager", "Branch Manager"],
  ["finance_manager", "Finance Manager"],
  ["technician", "Staff / Technician"],
  ["inventory_manager", "Inventory Manager"],
  ["job_creator", "Job Sheet Creator"],
];
const managerRoles = roles.filter(([role]) => role !== "branch_manager");
const roleDescriptions: Partial<Record<BranchRole, string>> = {
  branch_manager: "All operations for assigned branches.",
  finance_manager: "Invoices, payments, receipts and reports.",
  technician: "Assigned workshop tasks, updates and notes.",
  inventory_manager: "Products, stock, pricing and reorder levels.",
  job_creator: "Customer vehicle check-in and new job sheets.",
};
export default function TeamPage() {
  const { user, memberships, activeCompanyId, activeBranchId, activeBranch } = useAuth(),
    [members, setMembers] = useState<Member[]>([]),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState<string | null>(null),
    [memberAction, setMemberAction] = useState<{
      member: Member;
      action: "enable" | "disable" | "delete";
    } | null>(null),
    [showCreate, setShowCreate] = useState(false),
    [draft, setDraft] = useState({
      displayName: "",
      email: "",
      temporaryPassword: "",
      role: "job_creator" as BranchRole,
    });
  const own = memberships.find((item) => item.companyId === activeCompanyId),
    isOwner = (own?.companyRoles ?? []).some(
      (role) => role === "company_owner" || role === "company_admin",
    ),
    ownBranchRoles =
      (own?.branchAssignments ?? []).find((item) => item.branchId === activeBranchId)?.roles ?? [],
    isManager = ownBranchRoles.includes("branch_manager"),
    canManageTeam = isOwner || isManager,
    assignableRoles = isOwner ? roles : managerRoles,
    visibleRoles = canManageTeam
      ? assignableRoles
      : roles.filter(([role]) => ownBranchRoles.includes(role));
  const call = useCallback(
    async (path: string, options?: RequestInit) => {
      if (!user) throw new Error("Authentication required.");
      const [id, check] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch(path, {
          ...options,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${id}`,
            "x-firebase-appcheck": check,
          },
        }),
        result = await response.json();
      if (!response.ok) throw new Error((result as { error?: string }).error ?? "Request failed.");
      return result;
    },
    [user],
  );
  const load = useCallback(async () => {
    if (!canManageTeam || !activeCompanyId || !activeBranchId) return;
    try {
      const result = (await call(
        `/api/v1/team?companyId=${encodeURIComponent(activeCompanyId)}&branchId=${encodeURIComponent(activeBranchId)}`,
      )) as { members: Member[] };
      setMembers(result.members);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load team.");
    }
  }, [activeBranchId, activeCompanyId, canManageTeam, call]);
  useEffect(() => {
    void load();
  }, [load]);
  async function assign(member: Member, role: BranchRole) {
    if (!activeCompanyId || !activeBranchId) return;
    setSaving(member.id);
    try {
      await call("/api/v1/team/assign", {
        method: "POST",
        body: JSON.stringify({
          companyId: activeCompanyId,
          userId: member.userId,
          branchId: activeBranchId,
          roles: [role],
        }),
      });
      setMessage(`${member.displayName} updated.`);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update role.");
    } finally {
      setSaving(null);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!activeCompanyId || !activeBranchId) return;
    setSaving("create");
    try {
      await call("/api/v1/team/create", {
        method: "POST",
        body: JSON.stringify({ ...draft, companyId: activeCompanyId, branchId: activeBranchId }),
      });
      setShowCreate(false);
      setDraft({ displayName: "", email: "", temporaryPassword: "", role: "job_creator" });
      setMessage(
        "Staff account created. Share the temporary password securely and ask the staff member to change it.",
      );
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create staff.");
    } finally {
      setSaving(null);
    }
  }
  async function changeAccess() {
    if (!memberAction || !activeCompanyId || !activeBranchId) return;
    setSaving(memberAction.member.id);
    try {
      await call("/api/v1/team/status", {
        method: "POST",
        body: JSON.stringify({
          companyId: activeCompanyId,
          branchId: activeBranchId,
          userId: memberAction.member.userId,
          action: memberAction.action,
        }),
      });
      setMessage(
        memberAction.action === "delete"
          ? `${memberAction.member.displayName}'s login account was deleted.`
          : `${memberAction.member.displayName}'s login is now ${memberAction.action === "enable" ? "active" : "disabled"}.`,
      );
      setMemberAction(null);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to change staff access.");
    } finally {
      setSaving(null);
    }
  }
  return (
    <main className="content team-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">{canManageTeam ? "Company Access" : "Your Access"}</span>
          <h1>Team &amp; Roles</h1>
          <p className="muted">{canManageTeam ? "Staff access and roles." : "Your access."}</p>
        </div>
        {canManageTeam ? (
          <button
            className="quick-action quick-action--enabled"
            onClick={() => setShowCreate(true)}
          >
            <strong>+</strong> Add Staff
          </button>
        ) : null}
      </div>
      {message ? <div className="alert module-alert">{message}</div> : null}
      <section className="role-guide">
        {visibleRoles.map(([role, label]) => (
          <div key={role}>
            <strong>{label}</strong>
            <span>{roleDescriptions[role]}</span>
          </div>
        ))}
      </section>
      {canManageTeam ? (
        <section className="team-panel">
          {members.map((member) => {
            const assigned =
              (member.branchAssignments ?? []).find((item) => item.branchId === activeBranchId)
                ?.roles[0] ?? "viewer";
            return (
              <article className="team-row" key={member.id}>
                <div className="team-avatar">{member.displayName.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </div>
                {(member.companyRoles ?? []).length ? (
                  <span className="company-access">
                    {(member.companyRoles ?? []).join(", ").replaceAll("_", " ")}
                  </span>
                ) : (
                  <select
                    value={assigned}
                    disabled={saving === member.id}
                    onChange={(event) => void assign(member, event.target.value as BranchRole)}
                  >
                    {assignableRoles.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                {isOwner && !(member.companyRoles ?? []).length ? (
                  <div className="team-access-actions">
                    <span className={`member-status member-status--${member.status || "active"}`}>
                      {member.status === "disabled" ? "Disabled" : "Active"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberAction({
                          member,
                          action: member.status === "disabled" ? "enable" : "disable",
                        })
                      }
                    >
                      {member.status === "disabled" ? "Enable Login" : "Disable Login"}
                    </button>
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => setMemberAction({ member, action: "delete" })}
                    >
                      Delete Account
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
      {memberAction ? (
        <div className="modal-backdrop">
          <section className="module-modal staff-access-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Staff Login Access</span>
                <h2>
                  {memberAction.action === "delete"
                    ? "Delete Account?"
                    : memberAction.action === "disable"
                      ? "Disable Login?"
                      : "Enable Login?"}
                </h2>
              </div>
              <button type="button" onClick={() => setMemberAction(null)}>
                ×
              </button>
            </header>
            <div className="staff-access-copy">
              <strong>{memberAction.member.displayName}</strong>
              <span>{memberAction.member.email}</span>
              <p>
                {memberAction.action === "delete"
                  ? "This permanently removes the Firebase login. Historical jobs and audit records remain preserved."
                  : memberAction.action === "disable"
                    ? "The employee will be signed out and cannot log in until an Owner enables access again."
                    : "The employee can sign in again with their existing account."}
              </p>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setMemberAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={memberAction.action === "delete" ? "danger-button" : "dv-button"}
                disabled={saving === memberAction.member.id}
                onClick={() => void changeAccess()}
              >
                {saving === memberAction.member.id ? "Updating…" : "Confirm"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {canManageTeam && showCreate ? (
        <div className="modal-backdrop">
          <form className="module-modal" onSubmit={create}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{activeBranch?.name}</span>
                <h2>Create Staff Account</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                Staff Name
                <input
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  required
                />
              </label>
              <label>
                Temporary Password
                <input
                  type="password"
                  minLength={8}
                  value={draft.temporaryPassword}
                  onChange={(e) => setDraft({ ...draft, temporaryPassword: e.target.value })}
                  required
                />
              </label>
              <label>
                Role
                <select
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value as BranchRole })}
                >
                  {assignableRoles.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="dv-button" disabled={saving === "create"}>
                {saving === "create" ? "Creating…" : "Create Staff"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
