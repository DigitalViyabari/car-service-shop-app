# Firestore schema

Top-level collections are used for predictable collection-group queries and explicit tenant fields: `companies`, `branches`, `users`, `memberships`, `branchSubscriptions`, `customers`, `vehicles`, `jobSheets`, `jobTasks`, `services`, `products`, `inventoryItems`, `stockMovements`, `estimates`, `invoices`, `payments`, `expenses`, `notifications`, and `auditLogs`.

All branch-owned records contain `companyId`, `branchId`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, and (where meaningful) `status`. IDs are opaque. References are IDs, not embedded copies of sensitive records. Server timestamps are written in trusted mutations.

Membership ID is initially `{uid}_{companyId}` for constant-time rule lookup. It contains `userId`, `companyId`, `companyRoles[]`, `branchAssignments[{branchId, roles[]}]`, and status. `users` stores display/profile data only—never passwords or credentials.

Queries always include company and branch filters. Composite indexes are added alongside module implementation. Cross-branch reports are produced only for company-authorised users, preferably through Functions/materialized summaries. Audit logs are append-only, server-written, and include actor, tenant, action, target, timestamp, request/correlation ID, outcome, and support-access reason when applicable.

Current rules are intentionally conservative. Before operational modules launch, replace the generic fallback with collection-specific allowlists and emulator rule tests.
