# Nexus Repository Root Promotion (v1)

**Package:** P3.5 — Promote Nexus to Repository Root and Establish Capability Migration Authority  
**Status:** Complete  
**Supersedes:** nested `nexus/` as Vercel Root Directory (P2/P3 layout)

> **Path update (P3.5):** The Next.js application formerly under `nexus/` now lives at the **repository root**. Commands no longer require `cd nexus`. This document is authoritative for current paths.

## Before / after layout

### Before (P2–P3)

```
console/
├── app.py, routes/, static/, …     # legacy defined repository root
├── package.json                    # legacy minimal Node deps
└── nexus/                          # nested hosted Next.js app
    ├── app/, components/, convex/
    └── package.json                # authoritative for Nexus
```

### After (P3.5)

```
console/                    # repository root = Nexus (Vercel target)
├── app/, components/, convex/, lib/, styles/, tests/
├── package.json                    # Nexus authoritative
├── scripts/verify-nexus-boundary.sh
├── docs/specs/                     # Nexus architecture + migration specs
└── legacy_local_console/           # isolated local FastAPI Console
    ├── app.py, routes/, static/, …
    └── start-macos.sh
```

## Files promoted from `nexus/`

| Item | Root destination |
|------|----------------|
| `app/` | `app/` |
| `components/` | `components/` |
| `convex/` | `convex/` |
| `lib/` | `lib/` |
| `public/` | `public/` |
| `styles/` | `styles/` |
| `tests/` | `tests/` |
| `scripts/verify-nexus-boundary.sh` | `scripts/verify-nexus-boundary.sh` |
| `package.json`, `package-lock.json` | root |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | root |
| `middleware.ts`, `vitest.config.ts`, `vitest.setup.ts` | root |
| `convex.json`, `.env.example` | root |
| Nexus `README.md` content | merged into root `README.md` |

The `nexus/` directory was **removed** after promotion (no duplicate authoritative copy).

## Files moved into `legacy_local_console/`

- `app.py`, `start-macos.sh`, `build-macos-app.sh`, `setup.py`
- `docker-compose.yml`, `Dockerfile`, `docker/`
- `pyproject.toml`, `requirements.txt`, `requirements-optional.txt`
- `launch-windows.ps1`, `update_windows.bat`
- `routes/`, `core/`, `src/`, `static/`, `companion/`, `services/`, `config/`, `mcp_servers/`
- `tests/` (Python suite)
- `scripts/` (Odysseus/Nexus CLI helpers)
- `data/` (runtime, gitignored — moved with legacy if present)
- Legacy `.env.example`, `README_LEGACY_CONSOLE.md`
- Legacy `package.json` → `legacy-node-package.json`

## Files intentionally not moved

| Path | Reason |
|------|--------|
| `docs/` | Nexus specs and reform docs stay at repository root |
| `docs/specs/` | Authoritative hosted architecture |
| `.github/` | Repository CI/templates |
| `LICENSE`, `ACKNOWLEDGMENTS.md`, `ROADMAP.md` | Shared repo metadata |
| `CONTRIBUTING.md`, `SECURITY.md`, `THREAT_MODEL.md` | Shared (may reference both eras) |
| `licenses/` | Third-party license texts |
| Root `.env` | Operator secret file — not promoted; legacy uses `legacy_local_console/.env` |
| `venv/`, `logs/`, `__pycache__/` | Runtime artifacts at root — operator cleanup |

## Collision resolution

| Collision | Resolution |
|-----------|------------|
| Root `package.json` (legacy) | Renamed to `legacy_local_console/legacy-node-package.json`; Nexus `package.json` is authoritative |
| Root `package-lock.json` | Renamed to `legacy_local_console/legacy-node-package-lock.json` |
| Root `README.md` | Replaced with Nexus-first README; legacy copy in `legacy_local_console/README_LEGACY_CONSOLE.md` |
| Root `.env.example` | Nexus `.env.example` promoted; legacy copy in `legacy_local_console/.env.example` |
| `tests/` | Python tests → `legacy_local_console/tests/`; Vitest tests at root `tests/` |
| `scripts/` | Legacy scripts → `legacy_local_console/scripts/`; boundary script at root `scripts/` |
| `app/` | Legacy had no `app/` dir; Nexus `app/` promoted without conflict |

## Root build / deploy contract

| Setting | Value |
|---------|-------|
| Vercel Root Directory | `.` (repository root) |
| Install | `npm ci` |
| Build | `npm run build` |
| Output | Next.js default |
| Python / uvicorn | **Not used** |
| SQLite / `data/` | **Not required** |

No `vercel.json` required for standard Next.js preset.

## Root environment contract

Copy `.env.example` → `.env.local` at repository root:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CONVEX_URL` (after `npx convex dev`)

Legacy Console uses `legacy_local_console/.env` (separate).

## Convex location

`convex/` is beside root `package.json` — standard Convex + Next.js layout.

Bootstrap `convex/_generated/` preserved. **No cloud project linked in P3.5.**

## GitHub readiness

- Repository is git-ready at root with Nexus as primary application.
- `.gitignore` updated for Next.js + legacy paths.
- No remote created, no push performed.
- Operator may initialize GitHub with root directory = `.`.

## Secret hygiene

- `.env`, `.env.local`, `data/`, `*.db`, `venv/` remain gitignored.
- Root operator `.env` (if present) was **not** copied into tracked files.
- No secrets promoted into hosted source.

## Legacy launcher status

`legacy_local_console/start-macos.sh` uses `REPO_DIR="$(dirname …)"` → works from legacy directory.

**Operator action:** copy or symlink `.env` and `data/` into `legacy_local_console/` if previously at repository root.

## Tests / checks performed

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
./scripts/verify-nexus-boundary.sh
python3 -m py_compile legacy_local_console/app.py
```

Filesystem checks:

- No `nexus/package.json`
- Root `app/`, `convex/`, `package.json` exist
- `legacy_local_console/app.py` exists

## Rollback notes

Operator has external backup. To rollback locally:

1. Restore pre-P3.5 tree from backup, or
2. Re-nest promoted files under `nexus/` and move legacy back to root (manual).

## Next operator command

```bash
cd /Users/bretthoffman/Documents/console
npx convex dev
```

Then re-run validation and begin **P4** only after Convex is linked.

## Related documents

- [`nexus_legacy_capability_migration_matrix_v1.md`](nexus_legacy_capability_migration_matrix_v1.md)
- P2/P3 implementation notes (historical paths under `nexus/` — superseded for commands)
