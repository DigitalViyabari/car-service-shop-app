# Roles and permissions

The customer-facing role set is deliberately limited to Super Admin, Owner, Branch Manager, Finance Manager, Staff / Technician, Inventory Manager, and Job Sheet Creator. Super Admin and Owner are protected top-level roles. Owners and Branch Managers may create staff and assign one of the five branch roles: `branch_manager`, `finance_manager`, `technician`, `inventory_manager`, or `job_creator`.

`branch_manager` can manage all operational, inventory, and financial work for assigned branches. `finance_manager` is intentionally finance-only: the role can view and manage invoices, payments, receipts, and financial reports for assigned branches, but cannot create or alter customers, vehicles, jobs, workshop operations, products, or stock. `job_creator` can create a new job card for an existing customer and vehicle, but cannot change job status, estimates, inventory, invoices, payments, or reports.

The canonical initial mapping is in `packages/permissions`. Company roles can operate across the company according to their permission set. Branch roles apply only to matching `branchAssignments`. A technician receives only assigned-task read/update permissions by default and no financial permission. Platform support may request audited access but has no casual business-data entitlement.

Authorization is evaluated in four layers: rules for direct Firebase access, Functions for privileged operations, server-side Zod validation plus membership/subscription checks, and UI visibility. The UI is never the source of truth. Custom claims may accelerate platform checks, but Firestore membership remains authoritative for company/branch access and must be revalidated for sensitive changes.
