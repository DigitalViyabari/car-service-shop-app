export type PlatformRole = "platform_super_admin" | "platform_support_admin";
export type CompanyRole =
  "company_owner" | "company_admin" | "company_accountant" | "company_auditor";
export type BranchRole =
  | "branch_manager"
  | "service_advisor"
  | "cashier"
  | "inventory_manager"
  | "technician"
  | "receptionist"
  | "viewer";
export type Role = PlatformRole | CompanyRole | BranchRole;

export type Permission =
  | "platform.manage"
  | "support.request_access"
  | "company.read"
  | "company.manage"
  | "branch.read"
  | "branch.manage"
  | "subscriptions.read"
  | "subscriptions.manage"
  | "operations.read"
  | "operations.write"
  | "financials.read"
  | "inventory.manage"
  | "tasks.assigned.read"
  | "tasks.assigned.update";

export interface AuditFields {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Company extends AuditFields {
  id: string;
  name: string;
  status: "active" | "suspended";
}

export interface Branch extends AuditFields {
  id: string;
  companyId: string;
  name: string;
  code: string;
  status: "active" | "suspended" | "closed";
  timezone: string;
}

export interface UserProfile extends AuditFields {
  id: string;
  displayName: string;
  email: string;
  platformRoles: PlatformRole[];
  status: "active" | "disabled";
}

export interface BranchAssignment {
  branchId: string;
  roles: BranchRole[];
}

export interface Membership extends AuditFields {
  id: string;
  userId: string;
  companyId: string;
  companyRoles: CompanyRole[];
  /** Denormalized assigned branch IDs used by Firestore Security Rules. */
  branchIds: string[];
  branchAssignments: BranchAssignment[];
  status: "invited" | "active" | "disabled";
}

export type SubscriptionStatus =
  "trialing" | "active" | "grace_period" | "past_due" | "expired" | "suspended" | "cancelled";

export interface BranchSubscription extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  gracePeriodEnd?: string;
}
