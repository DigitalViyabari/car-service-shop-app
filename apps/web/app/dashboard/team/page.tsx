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
              </article>
            );
          })}
        </section>
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
