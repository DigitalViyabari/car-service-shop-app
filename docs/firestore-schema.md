# Firestore schema

Top-level collections are used for predictable collection-group queries and explicit tenant fields: `companies`, `branches`, `users`, `memberships`, `branchSubscriptions`, `customers`, `vehicles`, `jobSheets`, `jobTasks`, `services`, `products`, `inventoryItems`, `stockMovements`, `estimates`, `invoices`, `payments`, `expenses`, `notifications`, and `auditLogs`.

All branch-owned records contain `companyId`, `branchId`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, and (where meaningful) `status`. IDs are opaque. References are IDs, not embedded copies of sensitive records. Server timestamps are written in trusted mutations.

Membership ID is initially `{uid}_{companyId}` for constant-time rule lookup. It contains `userId`, `companyId`, `companyRoles[]`, `branchAssignments[{branchId, roles[]}]`, and status. `users` stores display/profile data only—never passwords or credentials.

Queries always include company and branch filters. Composite indexes are added alongside module implementation. Cross-branch reports are produced only for company-authorised users, preferably through Functions/materialized summaries. Audit logs are append-only, server-written, and include actor, tenant, action, target, timestamp, request/correlation ID, outcome, and support-access reason when applicable.

Current rules are intentionally conservative. Before operational modules launch, replace the generic fallback with collection-specific allowlists and emulator rule tests.

## Customers and vehicles

`customers` and `vehicles` are branch-owned top-level collections. Customer documents include normalized `searchName` and `searchPhone` fields; vehicle documents include normalized `searchRegistration`. These support fast branch-local lookup without copying private customer data into unrelated records.

Vehicles reference customers through `customerId`. Future job sheets will reference both IDs so historical service records remain stable. Customer `vehicleCount` is updated in the same batch as vehicle creation. Records are archived through `status` rather than physically deleted.

Vehicle records include colour as a standard field. Supported fuel choices include Petrol, Diesel, CNG, Petrol + CNG, Electric, Hybrid, and Other. Stored enum values remain normalized while all user-facing labels use title case.

## Vehicle catalogue

The shared Indian default catalogue ships as application reference data and is read-only to tenants. Company-owned additions are stored in `vehicleCatalog`, scoped by `companyId`, and may include make, model, variant, body type, supported fuels/transmissions, year range, and notes. Customer vehicle records copy selected text values rather than depending on a mutable catalogue document, preserving historical accuracy.

## Products and inventory

`products` contains the company-owned product master: identity, SKU/barcode, part numbers, category, HSN/GST, unit, MRP, inventory tracking preference, and compatibility notes. `inventoryItems` contains branch-owned commercial and stock values such as purchase/selling price, available and reserved quantity, reorder level, rack location, and supplier. The inventory document ID is `{branchId}_{productId}` for constant-time lookup.

Products and inventory items use archive status rather than deletion so future job cards, invoices, stock movements, and audit records keep stable references.

## Job cards

`jobSheets` stores branch-owned vehicle check-ins and their operational lifecycle. It references customer and vehicle IDs while retaining display snapshots for workshop speed and historical readability. The immutable job number, customer, vehicle and tenant references are protected by rules. Status transitions, complaints, odometer, fuel level, promised delivery, priority, assignments, estimate and invoice totals remain auditable.

`jobLineItems` stores active or removed labour and product estimate lines. Each line snapshots description, quantity, unit price, discount, GST rate, taxable value, tax, and total. Adding or removing a line updates the parent job estimate in the same atomic batch. Removed lines remain available for audit; preparing an estimate does not deduct physical stock.

`serviceTypes` stores company-specific workshop offerings and supports inline creation during vehicle check-in. Job creation time is always server-recorded. Odometer and fuel level may be explicitly left unknown rather than replaced with misleading zero values.

Estimate approval state is stored on the job with method, reference, notes, actor, timestamp, lock state, and revision number. Approved estimates are locked against line changes. Creating a revision explicitly unlocks the current estimate and increments its revision number while preserving the prior decision in audit history.

Reads require active company membership and branch access. Initial browser writes require `company_owner` or `company_admin`; branch-role write access will be added after role keys are denormalized into a rules-friendly membership field. Every mutation preserves immutable tenant and creation-audit fields and updates actor/timestamp audit fields.
