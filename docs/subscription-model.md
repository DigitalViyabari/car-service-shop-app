# Per-branch subscriptions

Every `branchSubscriptions/{branchId}` document belongs to exactly one company and branch. Status is one of `trialing`, `active`, `grace_period`, `past_due`, `expired`, `suspended`, or `cancelled`; dates include the current period end and optional grace-period end.

Only `trialing`, `active`, and a non-expired `grace_period` permit normal mutations. Read-only historical access policy can vary by plan, while owners always retain billing/subscription access. Expiry restricts only that branch and never deletes data or disables sibling branches.

Clients cannot author subscription state. A trusted webhook/administrator Function validates provider events, applies idempotency keys, updates the branch subscription, and appends an audit log. Every privileged operational mutation checks current server-side subscription state. Scheduled Functions transition overdue grace periods. Payment-provider integration is intentionally outside this foundation step.
