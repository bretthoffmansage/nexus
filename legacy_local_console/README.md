# Legacy legacy local console (local)

This directory contains the **legacy local legacy local console** — FastAPI backend, static ES-module frontend, SQLite persistence, local authentication, CLI Mirror, shell access, and direct Nexus Gateway/Core communication.

It is **not** the hosted Nexus product and is **not** deployed to Vercel.

## Start locally

```bash
cd legacy_local_console
cp .env.example .env    # first time; or copy your existing operator .env here
./start-macos.sh
```

Opens at `http://127.0.0.1:7860` (or `APP_PORT` from `.env`).

Recommended Console Mode:

```bash
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

## Layout

| Path | Purpose |
|------|---------|
| `app.py` | FastAPI application entry |
| `routes/` | HTTP route modules |
| `src/` | Agent loop, Nexus client, guards |
| `static/` | Legacy SPA (visual reference for Nexus P3 port) |
| `core/` | Auth, database, session manager |
| `services/` | Email, memory, docs, hwfit services |
| `tests/` | Python test suite |
| `scripts/` | Odysseus/Nexus CLI helpers |
| `data/` | Local SQLite and JSON stores (gitignored) |

## Hosted successor

User-facing capabilities from this application are being converted per:

[`docs/specs/nexus_legacy_capability_migration_matrix_v1.md`](../docs/specs/nexus_legacy_capability_migration_v1.md)

Nexus lives at the **repository root** (`../app`, `../components`, etc.).

## Launcher notes (P3.5)

`start-macos.sh` resolves `REPO_DIR` to this directory. After promotion, place `.env` and runtime `data/` here (not at repository root). If you previously ran from the repository root, copy or symlink:

```bash
cp ../.env .env          # if a root .env still exists
```

## Validation

Safe static check (no server start):

```bash
python3 -m py_compile app.py
```
