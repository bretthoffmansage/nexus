# Nexus

**Nexus** is the repository-root hosted web application for approved users. It is built with **Next.js**, **TypeScript**, **Clerk**, and **Convex**, and is intended for deployment to **Vercel** via **GitHub**.

**Claudia** is a separate private local execution system on the Claudia Mac. Nexus does not connect directly to Hermes, Claudia Core, local Python, SQLite, or the machine filesystem. Approved work flows **outbound only** through a future **Console Connector**.

The legacy **Claudia Console** (FastAPI + static SPA) is preserved for local reference and compatibility under [`legacy_local_console/`](legacy_local_console/).

## Repository layout

```
claudia_console/                 # local folder name (future GitHub repo may be named nexus)
├── app/                         # Next.js App Router (Nexus)
├── components/
├── convex/                      # Convex functions (beside package.json)
├── lib/
├── public/
├── styles/
├── tests/
├── scripts/
├── docs/specs/                  # authoritative architecture + migration specs
├── package.json                 # Nexus npm package (authoritative)
└── legacy_local_console/        # local FastAPI Claudia Console (not deployed to Vercel)
    ├── app.py
    ├── routes/, src/, static/
    └── start-macos.sh
```

## Package status

| Package | Status |
|---------|--------|
| **P2-nexus-shell** | Complete |
| **P3-ui-port-foundation** | Complete |
| **P3.5-repository-root-promotion** | Complete — Nexus promoted to repository root |
| **Post-convex-linkage cleanup** | Complete |
| **P4-clerk-approved-users-roles** | Complete — Clerk identity + Convex approval/roles |
| **P4.1-real-clerk-linkage-login** | Complete — linked Clerk app + embedded sign-in design |
| **P4.2-clerk-convex-auth-repair** | Complete — native session token + centered auth card |
| **P5+** | Not started — task persistence |

See [`docs/specs/nexus_p4_2_clerk_convex_auth_repair_and_auth_centering_v1.md`](docs/specs/nexus_p4_2_clerk_convex_auth_repair_and_auth_centering_v1.md) for the Clerk-to-Convex token fix.

## Run Nexus locally

Copy `.env.example` to `.env.local` and configure Clerk + Convex. For production, missing configuration fails closed (users see `/configuration-required`).

Required for signed-in flows:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (from `clerk init` or Clerk dashboard)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (default `/sign-in`, `/sign-up`)
- `NEXT_PUBLIC_CONVEX_URL`
- `CLERK_JWT_ISSUER_DOMAIN` (Next.js + Convex dashboard; after creating Clerk JWT template `convex`)

Webhook + bootstrap (server / Convex dashboard only):

- `CLERK_WEBHOOK_SECRET`
- `NEXUS_INTERNAL_API_SECRET`
- `NEXUS_BOOTSTRAP_ADMIN_EMAILS` (optional; disabled once an active `nexus_admin` exists)

```bash
cd /Users/bretthoffman/Documents/claudia_console
cp .env.example .env.local
# Add Clerk and Convex keys for sign-in testing

npm install
npx convex dev       # link Convex; keep running or use deploy
npm run dev          # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit/render tests |
| `npx convex dev` | Link Convex dev deployment + codegen |
| `./scripts/verify-nexus-boundary.sh` | Hosted/legacy boundary check |

## Vercel deployment

1. Import the GitHub repository in Vercel.
2. **Root Directory:** repository root (`.` — not a nested folder).
3. **Install command:** `npm ci`
4. **Build command:** `npm run build`
5. **Framework:** Next.js (default output)
6. Environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CONVEX_URL`
7. Deploy Convex separately: `npx convex deploy` from repository root.

No Python, uvicorn, SQLite, or `data/` directory is required for Nexus builds.

## Run legacy Claudia Console (local only)

```bash
cd legacy_local_console
cp .env.example .env    # or symlink/copy your existing .env
./start-macos.sh        # http://127.0.0.1:7860
```

The legacy launcher uses paths relative to `legacy_local_console/`. Runtime data (`data/`, `logs/`, `venv/`) belongs under that directory.

## Architecture references

- [`docs/specs/nexus_vercel_convex_architecture_correction_v1.md`](docs/specs/nexus_vercel_convex_architecture_correction_v1.md)
- [`docs/specs/nexus_hosted_console_architecture_audit_v1.md`](docs/specs/nexus_hosted_console_architecture_audit_v1.md)

## What Nexus does not include yet

- Clerk approved-user roles (P4)
- Convex task persistence and product tables (P5)
- Console Connector APIs (P6)
- Task submission, terminal execution, governed shell, Web Search, or direct Claudia/Hermes calls
