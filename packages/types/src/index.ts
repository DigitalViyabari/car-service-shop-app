export type PlatformRole = "platform_super_admin" | "platform_support_admin";
export type CompanyRole =
  "company_owner" | "company_admin" | "company_accountant" | "company_auditor";
export type BranchRole =
  | "branch_manager"
  | "service_advisor"
  | "finance_manager"
  | "job_creator"
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
  | "financials.manage"
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
  "petrol" | "diesel" | "cng" | "petrol_cng" | "electric" | "hybrid" | "other";
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
  insuranceExpiryDate?: string;
  insuranceReminderEnabled?: boolean;
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

export type ProductType =
  | "spare_part"
  | "consumable"
  | "lubricant"
  | "tyre"
  | "battery"
  | "accessory"
  | "workshop_material";

export interface Product extends AuditFields {
  id: string;
  companyId: string;
  name: string;
  nickname?: string;
  sku: string;
  barcode?: string;
  oemPartNumber?: string;
  manufacturerPartNumber?: string;
  brand?: string;
  category?: string;
  type: ProductType | string;
  description?: string;
  hsnCode?: string;
  gstRate: number;
  unit: string;
  mrp?: number;
  trackInventory: boolean;
  compatibilityNotes?: string;
  searchText: string;
  status: "active" | "archived";
}

export interface InventoryItem extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  productId: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  reservedStock: number;
  reorderLevel: number;
  rackLocation?: string;
  preferredSupplier?: string;
  status: "active" | "archived";
}

export type InventoryMovementType = "purchase" | "issue" | "adjustment_in" | "adjustment_out";
export interface InventoryMovement extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  productId: string;
  inventoryItemId: string;
  type: InventoryMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  supplier?: string;
  reference?: string;
  notes: string;
  occurredAt: string;
}

export type GstRegistrationType = "regular" | "composition" | "unregistered";
export interface GstRegistration extends AuditFields {
  id: string;
  companyId: string;
  gstin: string;
  legalName: string;
  pan?: string;
  registrationType: Exclude<GstRegistrationType, "unregistered">;
  state: string;
  stateCode: string;
  invoicePrefix: string;
  invoiceStartNumber: number;
  invoiceSeriesKey: string;
  status: "active" | "inactive";
}
export interface BusinessTaxProfile extends AuditFields {
  id: string;
  companyId: string;
  branchId?: string;
  gstRegistrationId?: string;
  invoiceSeriesKey?: string;
  legalName: string;
  tradeName: string;
  gstRegistered: boolean;
  gstin?: string;
  pan?: string;
  registrationType: GstRegistrationType;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  invoicePrefix: string;
  invoiceStartNumber?: number;
  invoiceTerms?: string;
  authorizedSignatory?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  invoiceLogoUrl?: string;
  invoiceAccentColor?: string;
  invoicePaperSize?: "A4" | "A5";
}

export type JobStatus =
  | "check_in"
  | "inspection"
  | "estimate_pending"
  | "approved"
  | "in_progress"
  | "quality_check"
  | "ready"
  | "delivered"
  | "cancelled";
export type JobPriority = "normal" | "urgent" | "breakdown";
export type EstimateApprovalStatus = "draft" | "sent" | "approved" | "rejected";
export type EstimateApprovalMethod = "whatsapp" | "phone" | "email" | "signature" | "in_person";

export interface ServiceType extends AuditFields {
  id: string;
  companyId: string;
  name: string;
  searchName: string;
  status: "active" | "archived";
}

export interface JobSheet extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  jobNumber: string;
  customerId: string;
  vehicleId: string;
  customerName: string;
  vehicleLabel: string;
  registrationNumber: string;
  status: JobStatus;
  priority: JobPriority;
  serviceType: string;
  odometer: number | null;
  fuelLevel: number | null;
  complaints: string[];
  internalNotes?: string;
  delayReason?: string;
  delayReportedAt?: string;
  delayReportedBy?: string;
  promisedAt?: string;
  checkedInAt: string;
  deliveredAt?: string;
  deliveryNotes?: string;
  qualityCheckedAt?: string;
  qualityCheckedBy?: string;
  qualityCheckNotes?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  nextServiceDueAt?: string;
  nextServiceDueKm?: number | null;
  assignedTechnicianIds: string[];
  estimateTotal: number;
  invoiceTotal: number;
  approvalStatus?: EstimateApprovalStatus;
  approvalMethod?: EstimateApprovalMethod;
  approvalReference?: string;
  approvalNotes?: string;
  approvalAt?: string;
  approvalBy?: string;
  estimateLocked?: boolean;
  estimateRevision?: number;
  revisionReason?: string;
  revisionCreatedAt?: string;
  revisionCreatedBy?: string;
}

export interface ServiceReminder extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  jobId: string;
  customerId: string;
  vehicleId: string;
  registrationNumber: string;
  dueAt?: string | null;
  dueKm?: number | null;
  status: "scheduled" | "sent" | "completed" | "cancelled";
}

export interface JobLineItem extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  jobId: string;
  type: "labour" | "product";
  productId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  gstRate: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: "active" | "removed";
}

export type InvoiceStatus = "issued" | "part_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "upi" | "card" | "bank_transfer" | "cheque" | "other";

export interface Invoice extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  sourceType?: "job" | "counter_sale";
  jobId: string;
  invoiceNumber: string;
  jobNumber?: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleLabel: string;
  registrationNumber: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  overpaidAmount?: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt?: string;
  notes?: string;
  amendmentCount?: number;
  lastAmendmentReason?: string;
  lastAmendedAt?: string;
  lastAmendedBy?: string;
  paymentFollowedUpAt?: unknown;
  paymentFollowedUpBy?: string;
  taxProfileId?: string;
  supplierLegalName?: string;
  supplierTradeName?: string;
  supplierGstin?: string;
  supplierAddress?: string;
}

export interface InvoiceLine extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  invoiceId: string;
  jobLineItemId: string;
  type: "labour" | "product";
  productId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  gstRate: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  status?: "active" | "superseded";
  amendmentNumber?: number;
}

export interface Payment extends AuditFields {
  id: string;
  companyId: string;
  branchId: string;
  invoiceId: string;
  jobId: string;
  receiptNumber: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  receivedAt: string;
  status: "completed" | "reversed";
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  correctionReason?: string;
  correctedAt?: string;
  correctedBy?: string;
  correctionHistory?: Array<{
    previousAmount: number;
    previousMethod: PaymentMethod;
    previousReference?: string;
    previousNotes?: string;
    reason: string;
    correctedAt: string;
    correctedBy: string;
  }>;
}

export interface CommunicationEntitlement extends AuditFields {
  id: string;
  companyId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  smsUnitRate: number;
  whatsappUnitRate: number;
  smsCredits: number;
  whatsappCredits: number;
  smsLowBalanceAt: number;
  whatsappLowBalanceAt: number;
  smsCredentialConfigured: boolean;
  whatsappCredentialConfigured: boolean;
  provider: "msg91";
  status: "active" | "suspended";
}

export type CommunicationChannel = "sms" | "whatsapp";
export type CommunicationLedgerType = "usage" | "recharge" | "adjustment" | "refund";

export interface CommunicationLedgerEntry extends AuditFields {
  id: string;
  companyId: string;
  channel: CommunicationChannel;
  type: CommunicationLedgerType;
  units: number;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId?: string;
  status: "pending" | "completed" | "failed" | "reversed";
}
