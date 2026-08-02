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

export type CustomerType = "individual" | "business";

export interface Customer extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  type: CustomerType;
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  notes?: string;
  searchName: string;
  searchPhone: string;
  vehicleCount: number;
  status: "active" | "archived";
}

export type VehicleFuelType =
  | "petrol"
  | "diesel"
  | "cng"
  | "petrol_cng"
  | "electric"
  | "hybrid"
  | "other";
export type VehicleTransmission = "manual" | "automatic" | "amt" | "cvt" | "dct" | "other";

export interface Vehicle extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  customerId: string;
  registrationNumber: string;
  make: string;
  model: string;
  variant?: string;
  colour?: string;
  year?: number;
  fuelType: VehicleFuelType;
  transmission?: VehicleTransmission;
  vin?: string;
  odometer?: number;
  notes?: string;
  searchRegistration: string;
  status: "active" | "archived";
}

export interface VehicleCatalogEntry extends AuditFields {
  id: string;
  companyId: string;
  make: string;
  model: string;
  variant?: string;
  bodyType?: string;
  fuelTypes: VehicleFuelType[];
  transmissions: VehicleTransmission[];
  yearFrom?: number;
  yearTo?: number;
  notes?: string;
  searchText: string;
  status: "active" | "archived";
}
