# System architecture

The pnpm/Turborepo workspace contains three deployable apps: a Next.js App Router web client, an Expo mobile client, and Firebase Cloud Functions. Shared packages provide platform-neutral types, Zod validation, browser/mobile Firebase initialization, auth session contracts, permissions, UI primitives, configuration, and utilities.

## Tenant boundary

The hierarchy is platform → company → branch. A user authenticates once, then memberships grant company roles and explicit branch assignments. Company-authorised roles may aggregate multiple branches; branch roles never gain access merely because the branches share a company. Every operational document duplicates `companyId` and `branchId`, and rules validate those fields rather than trusting paths or UI state.

Clients use the Firebase client SDK only. Admin SDK access belongs in Functions or another trusted VPS service. WordPress is suitable for the public marketing site and links into the app, but should not hold SaaS authorization state. Host the web app on a Node-capable service (the VPS, Firebase App Hosting, or equivalent), Functions on Firebase, and Expo builds through EAS/native stores.

## Trust boundaries

UI visibility improves usability but is not authorization. Firestore/Storage Rules enforce direct data access; callable Functions authenticate, validate inputs, check membership and subscription, and write audit events. App Check is required for callable Functions and should be enabled for web/mobile after provider registration. Platform support access is a time-limited, reason-bearing grant recorded in `auditLogs`, never implicit access.

## Deployment path

Use separate Firebase projects for development, staging, and production. CI should run formatting, lint, type checks, builds, emulator rule tests, then deploy rules/indexes/functions before web. Mobile releases use EAS profiles per environment. Roll back application deployments independently; never delete historical branch data on subscription changes.

The current Firebase project uses the India location (`asia-south1`, Mumbai). Regional Cloud Functions are configured for `asia-south1` to reduce application-to-database latency. This Firestore location is permanent after database creation and must remain consistent across environment documentation.
