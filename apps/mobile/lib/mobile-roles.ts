import type { Membership } from "@dvcs/types";

type MobileMembership = Membership & { branchRoleKeys?: string[] };

export function branchRoles(membership: Membership | null, branchId?: string) {
  if (!membership || !branchId) return [] as string[];
  const assignment = membership.branchAssignments?.find((item) => item.branchId === branchId);
  // branchRoleKeys is retained only for legacy memberships. Current assignments are branch-scoped
  // and must not leak a role from one branch into another branch.
  const roles = assignment?.roles ?? (membership as MobileMembership).branchRoleKeys ?? [];
  return [...new Set(roles)];
}

export function hasCompanyControl(membership: Membership | null) {
  return Boolean(
    membership?.companyRoles?.some((role) => role === "company_owner" || role === "company_admin"),
  );
}

export function isTechnicianOnly(membership: Membership | null, branchId?: string) {
  return Boolean(
    membership &&
    !membership.companyRoles?.length &&
    branchRoles(membership, branchId).includes("technician"),
  );
}

export function canCreateOperations(membership: Membership | null, branchId?: string) {
  if (!membership) return false;
  if (hasCompanyControl(membership)) return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "job_creator"].includes(role),
  );
}

export function canManageCustomers(membership: Membership | null, branchId?: string) {
  if (!membership) return false;
  if (hasCompanyControl(membership)) return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "job_creator"].includes(role),
  );
}

export function canViewWorkshopJobs(membership: Membership | null, branchId?: string) {
  return canCreateOperations(membership, branchId);
}

export function canViewAssignedJobs(membership: Membership | null, branchId?: string) {
  return branchRoles(membership, branchId).includes("technician");
}

export function canViewFinance(membership: Membership | null, branchId?: string) {
  if (!membership) return false;
  if (
    membership.companyRoles?.some((role) =>
      ["company_owner", "company_admin", "company_accountant"].includes(role),
    )
  )
    return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "finance_manager"].includes(role),
  );
}

export function canViewInventory(membership: Membership | null, branchId?: string) {
  if (!membership) return false;
  if (hasCompanyControl(membership)) return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "inventory_manager"].includes(role),
  );
}
