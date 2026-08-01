# Development setup

Requirements: Node 22 LTS (the Functions production runtime), pnpm 11, Java for the Firebase emulators, Firebase CLI, and Android Studio/Xcode as needed for mobile simulators.

1. Run `pnpm install`.
2. Copy each `.env.example` to its local counterpart and use a development Firebase web app's public client configuration. These values identify a Firebase project; security still depends on Auth, Rules, and App Check. Never add Admin service-account JSON.
3. Copy `.firebaserc.example` to `.firebaserc`, select the development project, and run `firebase login` if needed.
4. Run web with `pnpm --filter @dvcs/web dev` (port 3000).
5. Run mobile with `pnpm --filter @dvcs/mobile dev`; press `a` or `i`, or scan via Expo Go when compatible.
6. Run the full local Firebase suite with `pnpm emulators` (UI port 4000). Run Functions only with `pnpm --filter @dvcs/functions serve`.
7. Validate with `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Firebase Console work

Create separate Firebase projects, register web/iOS/Android apps, enable approved Authentication providers, create Firestore and Storage, configure App Check providers/enforcement, configure FCM/APNs credentials, set Functions region/billing/Secret Manager values, and create production indexes as features require them. Download native Firebase files only when the chosen Expo build strategy requires them; keep them out of Git.

The configured development project is `dv-car-service-shop-app`; its selected Firestore location is India (`asia-south1`, Mumbai). Functions are deployed to the same region.

For production, point a dedicated app subdomain such as `app.example.com` at the web host. Keep WordPress on the marketing domain. The VPS may host Next.js or auxiliary trusted services, but Firebase Admin credentials must be injected as secrets and never copied to clients.
