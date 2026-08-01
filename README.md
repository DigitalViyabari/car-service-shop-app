# Digital Viyabari Car Service

Production-oriented foundation for a multi-company, multi-branch automotive service SaaS. Each branch has isolated operational data and its own subscription.

## Quick start

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
cp .firebaserc.example .firebaserc
pnpm dev
```

Run one target with `pnpm --filter @dvcs/web dev`, `pnpm --filter @dvcs/mobile dev`, or `pnpm emulators`. See `docs/development-setup.md` before connecting Firebase.

Authentication and tenant-session behavior is documented in `docs/authentication.md`.
# car-service-shop-app
