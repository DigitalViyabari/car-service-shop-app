# Authentication and tenant session

Firebase Authentication proves identity; it does not grant company or branch access. After Email/Password sign-in, the web client reads `users/{uid}` and active `memberships` whose `userId` equals the authenticated UID. The membership then authorizes reads of company, branch, and branch-subscription context through Firestore Security Rules.

Email addresses are never used as authorization keys. The initial owner email `viyabaridigital@gmail.com` must first be created in Firebase Authentication, then its generated UID must be used in an administrator-created profile and membership. Ownership is granted only by the membership document.

## Required bootstrap records

Create these records through a trusted administrator process, not from the browser:

- `users/{uid}`: display name, email, active status, and platform roles.
- `companies/{companyId}`: company name and active status.
- `branches/{branchId}`: company ID, branch name/code, timezone, and active status.
- `memberships/{uid}_{companyId}`: user/company IDs, `companyRoles`, denormalized `branchIds`, detailed `branchAssignments`, and active status.
- `branchSubscriptions/{branchId}`: company/branch IDs, plan, status, period end, and optional grace-period end.

All records include audit fields. Until a trusted bootstrap tool is available, use the Firebase Console while signed in as the project owner. Never allow clients to create their own membership, company role, or subscription.

## Web behavior

Firebase Auth persistence restores the browser session. The dashboard redirects signed-out users to login. Authenticated users without an active profile/membership see a setup-required state. Company-level memberships load all company branches; branch-only memberships fetch only their denormalized `branchIds`, preventing a query that could include sibling branches.

The browser route guard is a navigation control, not the security boundary. Firestore Rules remain authoritative. A later server-session step will add Firebase session cookies for server-rendered protected pages after trusted Admin SDK credentials are installed on the VPS.
