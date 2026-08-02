import type { Membership, Permission, Role, UserProfile } from "@dvcs/types";

const rolePermissions: Record<Role, readonly Permission[]> = {
  platform_super_admin: ["platform.manage", "support.request_access"],
  platform_support_admin: ["support.request_access"],
  company_owner: [
    "company.read",
    "company.manage",
    "branch.read",
    "branch.manage",
    "subscriptions.read",
    "subscriptions.manage",
    "operations.read",
    "operations.write",
    "financials.read",
    "financials.manage",
    "inventory.manage",
  ],
  company_admin: [
    "company.read",
    "company.manage",
    "branch.read",
    "branch.manage",
    "subscriptions.read",
    "operations.read",
    "operations.write",
    "financials.read",
    "financials.manage",
    "inventory.manage",
  ],
  company_accountant: ["company.read", "branch.read", "subscriptions.read", "financials.read"],
  company_auditor: [
    "company.read",
    "branch.read",
    "subscriptions.read",
    "operations.read",
    "financials.read",
  ],
  branch_manager: [
    "branch.read",
    "branch.manage",
    "operations.read",
    "operations.write",
    "financials.read",
    "financials.manage",
    "inventory.manage",
  ],
  finance_manager: ["branch.read", "financials.read", "financials.manage"],
  job_creator: ["branch.read", "operations.read", "operations.write"],
  service_advisor: ["branch.read", "operations.read", "operations.write"],
  inventory_manager: ["branch.read", "operations.read", "inventory.manage"],
  technician: ["branch.read", "tasks.assigned.read", "tasks.assigned.update"],
  receptionist: ["branch.read", "operations.read", "operations.write"],
  viewer: ["branch.read", "operations.read"],
};

export interface AccessContext {
  user: UserProfile;
  membership?: Membership;
  branchId?: string;
}

export function hasPermission(context: AccessContext, permission: Permission): boolean {
  if (context.user.status !== "active") return false;
  if (context.user.platformRoles.some((role) => rolePermissions[role].includes(permission)))
    return true;
  const membership = context.membership;
  if (!membership || membership.status !== "active") return false;
  const roles: Role[] = [...membership.companyRoles];
  if (context.branchId) {
    const assignment = membership.branchAssignments.find(
      (item) => item.branchId === context.branchId,
    );
    if (!assignment && membership.companyRoles.length === 0) return false;
    roles.push(...(assignment?.roles ?? []));
  }
  return roles.some((role) => rolePermissions[role].includes(permission));
}

export function accessibleBranchIds(
  membership: Membership,
  allCompanyBranchIds: readonly string[],
): string[] {
  if (membership.status !== "active") return [];
  if (membership.companyRoles.length > 0) return [...allCompanyBranchIds];
  return membership.branchAssignments.map(({ branchId }) => branchId);
}
