# Package 20A — claudia_console folder rename compatibility pass

| Field | Value |
|-------|-------|
| **Package** | Package 20A — claudia_console folder rename compatibility pass |
| **Date/time** | 2026-06-02 |
| **Current repo path** | `/Users/bretthoffman/Documents/claudia_console` |
| **Old repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_19_final_authority_hardening.md` |

## Objective

Audit and update active paths, launch instructions, docs, tests, and scripts so Claudia Console/Gateway works correctly after the repository folder rename from `odysseus` to `claudia_console`. Small compatibility pass before Package 20 (final safety audit / operator handoff).

**Historical note:** Package notes 00–19 record the old checkout path at the time each package was implemented. Those references are **historical only** and were intentionally left unchanged in this pass. Active operator docs now use `claudia_console`.

## Files changed

| File | Change |
|------|--------|
| `start-macos.sh` | Operator launch comments; Claudia Console user-facing messages; repo-relative path logic unchanged |
| `README.md` | Dedicated Claudia Mac launch block with `claudia_console` path |
| `docs/claudia_console_reform/private_pwa_deployment_hardening.md` | Repository path section; explicit launch commands; health URL port 7860 for native macOS |
| `.env.example` | Checkout path and launch comment block |
| `SECURITY.md` | Claudia Console launch path pointer |
| `THREAT_MODEL.md` | Claudia Console / Core checkout paths in addendum |
| `scripts/README.md` | Checkout path |
| `docker/README.md` | Checkout path |
| `docs/claudia_console_reform/legacy_archive/README.md` | Active deployment path with full checkout path |
| `launch-windows.ps1` | Comment: primary Mac path uses `claudia_console` |
| `tests/test_claudia_folder_rename_compatibility.py` | **New** — static checks for path rename compatibility |
| `docs/claudia_console_reform/package_20a_folder_rename_compatibility.md` | **New** — this note |

## Behavior changed

- **Operator documentation only:** Active launch instructions, env example comments, and `start-macos.sh` console output strings now say “Claudia Console” and document `/Users/bretthoffman/Documents/claudia_console`.
- **No runtime logic changes:** Port defaults (`7860` native), Ollama/Cookbook behavior, auth, Console Mode, Gateway, and authority guards are unchanged.

## Behavior intentionally unchanged

- `start-macos.sh` still resolves `REPO_DIR` from the script location (works from any folder name).
- `ODYSSEUS_PORT`, `ODYSSEUS_HOST`, `ODYSSEUS_*` env vars and internal identifiers (`odysseus_session`, `odysseus-theme`, `X-Odysseus-*`, Docker service name `odysseus`, etc.).
- Claudia Core is not started; `CLAUDIA_CORE_URL` remains optional.
- GitHub clone URLs still reference the upstream `odysseus` repository name (upstream rename out of scope).
- Historical package notes 00–19 retain old `/Users/bretthoffman/Documents/odysseus` path rows.

## Folder rename compatibility matrix

| File/path | Old reference found? | Change made | Notes |
|-----------|------------------------|-------------|-------|
| `start-macos.sh` | No hardcoded old path (already repo-relative) | Updated operator comments and user-facing “Claudia Console” messages; documented launch path | `REPO_DIR` from `BASH_SOURCE`; no folder-name requirement |
| `README.md` | No old local path | Added dedicated Claudia Mac launch block with `claudia_console` path | GitHub `git clone …/odysseus.git` unchanged (upstream repo name) |
| `private_pwa_deployment_hardening.md` | No old local path | Added repo path section, launch commands, Console Mode env, health URL `:7860` | Active operator guide |
| `.env.example` | No old local path | Added checkout path + launch comment | Claudia private deployment block unchanged |
| `SECURITY.md` | No old local path | Added launch path to Claudia Console bullet | `odysseus.db` in gitignore example unchanged |
| `THREAT_MODEL.md` | No old local path | Added Console/Core checkout paths in addendum | Threat model content unchanged |
| `scripts/README.md` | No old local path | Added checkout path | `odysseus-*` CLI names unchanged |
| `docker/README.md` | No old local path | Added checkout path | Docker service name `odysseus` unchanged |
| `launch-windows.ps1` | No old local path | Comment updated for Mac primary path | Uses `$PSScriptRoot` (repo-relative) |
| `Dockerfile` / `docker-compose.yml` | No old checkout path | No change | Container user/service `odysseus` unchanged |
| Historical package notes (`package_00`–`package_19`) | Yes — `/Users/bretthoffman/Documents/odysseus` in metadata tables | **No change** (historical) | Documented as historical in this note |
| `legacy_archive/` | No old Documents path | Updated active deployment path line | Archived systemd artifacts retain `odysseus-ui` names |

## Final launch script / command

**Basic launch:**

```bash
cd /Users/bretthoffman/Documents/claudia_console
./start-macos.sh
```

Opens at `http://127.0.0.1:7860`.

**Recommended Claudia Console Mode launch:**

```bash
cd /Users/bretthoffman/Documents/claudia_console
CLAUDIA_CONSOLE_MODE=true ./start-macos.sh
```

Or in `.env`:

```env
CLAUDIA_CONSOLE_MODE=true
AUTH_ENABLED=true
LOCALHOST_BYPASS=false
```

Optional Gateway→Core (loopback or private LAN only; never commit secrets):

```env
CLAUDIA_CORE_URL=http://127.0.0.1:<core-port>
CLAUDIA_GATEWAY_SHARED_SECRET=<set in local .env>
```

## Console Mode recommended env

| Variable | Recommended value | Notes |
|----------|-------------------|-------|
| `CLAUDIA_CONSOLE_MODE` | `true` | Console/Gateway shell; demotes in-process authority |
| `AUTH_ENABLED` | `true` | Required for network-accessible deployments |
| `LOCALHOST_BYPASS` | `false` | Dev-only on localhost |
| `APP_BIND` | `127.0.0.1` | Tailscale Serve / SSH tunnel preferred over `0.0.0.0` |
| `CLAUDIA_CORE_URL` | `http://127.0.0.1:<core-port>` | Optional; Core runs separately |
| `CLAUDIA_GATEWAY_SHARED_SECRET` | Set in local `.env` | Never commit |

## Historical old path references

| Location | Old path present? | Status |
|----------|-------------------|--------|
| `docs/claudia_console_reform/package_00_baseline_repo_state.md` | Yes (`/Users/bretthoffman/Documents/odysseus`, `cd ~/Documents/odysseus`) | Historical — baseline snapshot |
| `docs/claudia_console_reform/package_01` … `package_19` | Yes — repo path metadata row | Historical — per-package implementation record |
| Active operator docs (`README.md`, `private_pwa_deployment_hardening.md`, `.env.example`, `SECURITY.md`, etc.) | No | Updated to `claudia_console` |
| `legacy_archive/` systemd artifacts | `odysseus-ui.service` filename only | Archived Linux path; not Claudia Mac primary |

## Internal identifiers intentionally unchanged

- `odysseus_session`, `odysseus-theme`, `odysseus-last-user`, `_odysseusLoadTime`
- `ODYSSEUS_PORT`, `ODYSSEUS_HOST`, `ODYSSEUS_INPROCESS_*`, `ODYSSEUS_ADMIN_*`
- `X-Odysseus-*` headers, `odysseus_kind`, Chroma collections `odysseus_*`
- Docker Compose service name `odysseus`, container user `odysseus`
- `scripts/odysseus-*` CLI entry points
- Python modules, DB tables, cookie names

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_folder_rename_compatibility.py \
  tests/test_claudia_final_authority_hardening.py \
  tests/test_claudia_legacy_cleanup_archive.py \
  tests/test_claudia_final_audit_artifacts.py \
  tests/test_claudia_private_deployment_hardening.py \
  tests/test_claudia_legacy_ui_classification.py \
  tests/test_claudia_branding.py \
  tests/test_claudia_authority_demotion.py \
  tests/test_claudia_execution_surface_guards.py \
  tests/test_claudia_connector_email_calendar_guards.py \
  tests/test_claudia_approval_routes.py \
  tests/test_claudia_dashboard_skeleton.py \
  tests/test_claudia_upload_processing_guards.py \
  tests/test_claudia_upload_bridge.py \
  tests/test_claudia_source_worker_routes.py \
  tests/test_claudia_messages.py \
  tests/test_claudia_chat_demotion.py \
  tests/test_claudia_gateway_routes.py \
  tests/test_claudia_token_scopes.py \
  tests/test_claudia_packets.py \
  tests/test_claudia_console_mode.py
```

## Results

| Check | Result |
|-------|--------|
| `bash -n start-macos.sh` | **Pass** |
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| Focused Claudia tests (21 files, incl. `test_claudia_folder_rename_compatibility.py`) | **Pass** — 202 tests |
| `start-macos.sh` repo-relative (`REPO_DIR` from script dir) | **Verified** — no hardcoded `odysseus` checkout path |
| Active operator docs contain `claudia_console` path | **Verified** by new tests |
| Old `/odysseus` checkout path in active docs | **None** — only in historical package notes 00–19 |

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` may still report 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

Not addressed in Package 20A unless directly related.

## Risks

- Operators with bookmarks or shell aliases pointing at `~/Documents/odysseus` must update to `claudia_console`.
- Upstream GitHub repo is still named `odysseus`; clone instructions say `cd odysseus` while local checkout may be `claudia_console`.
- systemd archive paths in `legacy_archive/odysseus-ui.service` still require manual path edits if restored on Linux.

## Follow-ups

- Package 20 — final safety audit and operator handoff.
- Optional: upstream GitHub repo rename / clone URL alignment (out of scope for 20A).

## Next recommended package

**Package 20 — Final safety audit and operator handoff**
