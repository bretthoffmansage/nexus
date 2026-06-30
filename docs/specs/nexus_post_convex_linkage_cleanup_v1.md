# Nexus Post-Convex Linkage Cleanup (v1)

**Package:** Post-linkage cleanup and repository stabilization (pre-P4)  
**Status:** Complete  
**Date:** 2026-06-30

## Convex project linkage

| Field | Value |
|-------|-------|
| Team | `blue-melnick-fa2a1` |
| Project | `nexus` |
| Dev deployment | Linked successfully |
| Local env | `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` written to `.env.local` (not committed) |
| Generated code | Real `convex/_generated/` from linked project (replaced bootstrap placeholders) |

No deployment URLs, deployment slugs, or API keys are recorded in this document.

## Convex config warning — root cause

`convex.json` used unsupported property `node.version`. Convex schema (`node_modules/convex/schemas/convex.schema.json`) defines `node.nodeVersion` only.

## Convex config fix

```json
{
  "node": {
    "nodeVersion": "22"
  }
}
```

## Convex validation

```bash
npx convex codegen
```

Result: **PASS** — no `Unknown property in node: version` warning.

## Middleware / proxy decision

**Migrated** `middleware.ts` → `proxy.ts` per Next.js 16 convention.

- Preserved `clerkMiddleware` behavior (public `/sign-in`, `auth.protect()` elsewhere when Clerk configured, no-op when keys absent).
- Build output shows `ƒ Proxy (Middleware)` without middleware deprecation warning.
- Updated `scripts/verify-nexus-boundary.sh` and `tests/boundary-static.test.ts` to scan `proxy.ts`.

Clerk v7.5.10 continues to use `clerkMiddleware` inside `proxy.ts` default export — verified by production build.

## Secret / runtime hygiene

| Path | gitignore | Staged |
|------|-----------|--------|
| `.env` | yes | no |
| `.env.local` | yes | no |
| `legacy_local_console/.env` | yes | no |
| `legacy_local_console/data/` | yes | no |

`.gitignore` covers: `node_modules/`, `.next/`, `.convex/`, `venv/`, `__pycache__/`, `*.db`, `data/`, legacy runtime paths.

`convex/_generated/` committed as expected Convex source artifacts.

## Git migration state (before cleanup commit)

- Branch: `main`
- Remote: `origin` → `https://github.com/pewdiepie-archdaemon/odysseus.git` (pre-existing, not modified)
- Working tree: large P3.5 root promotion (legacy deletions + new Nexus root + `legacy_local_console/`)

## Files / config changed in this pass

| File | Change |
|------|--------|
| `convex.json` | `node.version` → `node.nodeVersion` |
| `middleware.ts` | removed |
| `proxy.ts` | added (Clerk route protection) |
| `scripts/verify-nexus-boundary.sh` | scan `proxy.ts` |
| `tests/boundary-static.test.ts` | scan `proxy.ts` |

## Validation commands and results

```bash
npm run lint          # PASS
npm run typecheck     # PASS
npm test              # PASS (9 tests)
npm run build         # PASS — Proxy without deprecation warning
./scripts/verify-nexus-boundary.sh  # PASS
npx convex codegen    # PASS — no node config warning
python3 -m py_compile legacy_local_console/app.py  # PASS
```

## Commit

| Field | Value |
|-------|-------|
| Created | Yes (if hash present below) |
| Message | `Promote Nexus to repository root` |
| Pushed | **No** |

## Remote / provisioning

- No new remote created
- Nothing pushed
- No Vercel deploy
- No Clerk provisioning
- No P4/P5/P6 product logic added

## Repository ready for P4?

**Yes**, after operator confirms:

1. `.env.local` contains valid Clerk keys when testing signed-in flows
2. Convex dev deployment remains linked (`npx convex dev` as needed)
3. Legacy Console `.env` / `data/` live under `legacy_local_console/` if still using local FastAPI

## Exact next step

Begin **P4 — Clerk approved users and roles** using repository root paths:

```bash
cd /Users/bretthoffman/Documents/claudia_console
# Convex should already be linked; re-run if needed:
npx convex dev
```

Do not implement product tables beyond P4 scope without following the P4 package spec.
