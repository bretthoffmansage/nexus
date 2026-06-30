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
| **P4+** | Not started — link Convex project first |

See [`docs/specs/nexus_repository_root_promotion_v1.md`](docs/specs/nexus_repository_root_promotion_v1.md) for migration details and [`docs/specs/nexus_legacy_capability_migration_matrix_v1.md`](docs/specs/nexus_legacy_capability_migration_matrix_v1.md) for the capability conversion plan.

## Run Nexus locally

```bash
cd /Users/bretthoffman/Documents/claudia_console
cp .env.example .env.local
# Optional: add Clerk keys for sign-in testing

npm install
npm run dev          # http://localhost:3000
```

### Next operator step (before P4)

Link the real Convex project:

```bash
cd /Users/bretthoffman/Documents/claudia_console
npx convex dev
```

Then validate:

```bash
npm run lint
npm run typecheck
npm test
npm run build
./scripts/verify-nexus-boundary.sh
```

Begin **P4 Clerk approval/roles** only after Convex is linked.

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
