# Roles and permissions

Platform roles are `platform_super_admin` and `platform_support_admin`. Company roles are `company_owner`, `company_admin`, `company_accountant`, and `company_auditor`. Branch roles are `branch_manager`, `finance_manager`, `service_advisor`, `cashier`, `inventory_manager`, `technician`, `receptionist`, and `viewer`.

`branch_manager` can manage all operational, inventory, and financial work for assigned branches. `finance_manager` is intentionally finance-only: the role can view and manage invoices, payments, receipts, and financial reports for assigned branches, but cannot create or alter customers, vehicles, jobs, workshop operations, products, or stock. `cashier` can receive payments while broader finance administration belongs to the Finance Manager, Branch Manager, Company Admin, or Company Owner.

The canonical initial mapping is in `packages/permissions`. Company roles can operate across the company according to their permission set. Branch roles apply only to matching `branchAssignments`. A technician receives only assigned-task read/update permissions by default and no financial permission. Platform support may request audited access but has no casual business-data entitlement.

Authorization is evaluated in four layers: rules for direct Firebase access, Functions for privileged operations, server-side Zod validation plus membership/subscription checks, and UI visibility. The UI is never the source of truth. Custom claims may accelerate platform checks, but Firestore membership remains authoritative for company/branch access and must be revalidated for sensitive changes.
