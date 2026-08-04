import type { Membership } from "@dvcs/types";

type MobileMembership = Membership & { branchRoleKeys?: string[] };

export function branchRoles(membership: Membership | null, branchId?: string) {
  if (!membership || !branchId) return [] as string[];
  const assigned = membership.branchAssignments?.find((item) => item.branchId === branchId)?.roles ?? [];
  return [...new Set([...(membership as MobileMembership).branchRoleKeys ?? [], ...assigned])];
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
  if (membership.companyRoles?.some((role) => role === "company_owner" || role === "company_admin"))
    return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "job_creator"].includes(role),
  );
}

export function canManageCustomers(membership: Membership | null, branchId?: string) {
  if (!membership) return false;
  if (membership.companyRoles?.some((role) => role === "company_owner" || role === "company_admin"))
    return true;
  return branchRoles(membership, branchId).includes("branch_manager");
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
  if (membership.companyRoles?.some((role) => role === "company_owner" || role === "company_admin"))
    return true;
  return branchRoles(membership, branchId).some((role) =>
    ["branch_manager", "inventory_manager"].includes(role),
  );
}
