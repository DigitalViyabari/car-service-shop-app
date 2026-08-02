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

Reads require active company membership and branch access. Initial browser writes require `company_owner` or `company_admin`; branch-role write access will be added after role keys are denormalized into a rules-friendly membership field. Every mutation preserves immutable tenant and creation-audit fields and updates actor/timestamp audit fields.
