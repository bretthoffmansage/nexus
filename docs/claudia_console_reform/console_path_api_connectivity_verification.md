# legacy local console Path/API Connectivity Verification Pass

| Field | Value |
|-------|-------|
| **Pass name** | legacy local console Path/API Connectivity Verification Pass |
| **Date/time** | 2026-06-03 |
| **Console path** | `/Users/bretthoffman/Documents/console` |
| **Core path** | `/Users/bretthoffman/Documents/system` |
| **Core API default URL** | `http://127.0.0.1:8080` |
| **Console default URL** | `http://127.0.0.1:7860` |
| **Prior notes** | `package_20_final_safety_audit_operator_handoff.md`, `package_20a_folder_rename_compatibility.md`, bridge packages `package_bridge_*` |

## Objective

Audit and correct active operator docs, config, scripts, and tests so legacy local console/Gateway launches from the standalone checkout and connects to Nexus Core at the sibling `system` path using Core API `http://127.0.0.1:8080`. Verify Gateway behavior against the Core API contract status from the Nexus System verification pass.

## Old nested paths audited

Temporary layout (no longer final runtime):

- `/Users/bretthoffman/Documents/nexus/system`
- `/Users/bretthoffman/Documents/nexus/console`
- `/Users/bretthoffman/Documents/Nexus/system`
- `/Users/bretthoffman/Documents/Nexus/console`
- `Documents/nexus/system`, `Documents/nexus/console`
- `cd ~/Documents/nexus/system`, `cd ~/Documents/nexus/console`

## Files changed

| File | Change |
|------|--------|
| `docs/console_reform/NEXUS_CONSOLE_OPERATOR_HANDOFF.md` | Recommended `.env` now includes explicit `NEXUS_CORE_URL=http://127.0.0.1:8080` and Core checkout path note |
| `docs/console_reform/private_pwa_deployment_hardening.md` | Dedicated Mac `.env` block uses explicit Core API URL `8080` |
| `docs/console_reform/package_20_final_safety_audit_operator_handoff.md` | Optional Gateway→Core env example uses `8080` (active operator section) |
| `docs/console_reform/final_console_gateway_checklist.md` | Optional Core wiring checklist with full paths and `8080` health curls |
| `scripts/README.md` | Bridge test comments use final standalone Core/Console paths |
| `tests/test_console_path_api_connectivity.py` | **New** — nested-path audit, Core URL default, 404→`/intake` fallback, approvals placeholder, health probe |
| `docs/console_reform/console_path_api_connectivity_verification.md` | **New** — this note |

## Behavior changed

**None in runtime code.** Documentation and static test artifacts only. Gateway forward/fallback logic in `src/nexus_client.py` was already correct; verified by new tests.

## Behavior intentionally unchanged

- `start-macos.sh` repo-relative launch, port `7860`, Ollama/local model behavior
- Console Mode safety model, auth, Gateway packet schema
- Nexus Core is **not** started by Console
- 404 fallback from `/source-packets`, `/worker-outputs`, `/messages` to `/intake`
- Honest approvals placeholder when Core `/approvals` is missing or errors
- Approval resolve forward-only (no local execution)
- Internal `odysseus_*` identifiers, Python modules, DB tables
- Historical package notes `package_00`–`package_20a` and bridge notes `package_bridge_*`

## Path compatibility matrix

| File/path | Old nested path found? | Change made | Notes |
|-----------|------------------------|-------------|-------|
| `README.md` | No | No | Already documents `/Users/bretthoffman/Documents/console` |
| `start-macos.sh` | No | No | Repo-relative `REPO_DIR`; correct launch path in comments |
| `.env.example` | No | No | Already has `NEXUS_CORE_URL=http://127.0.0.1:8080` |
| `NEXUS_CONSOLE_OPERATOR_HANDOFF.md` | No | **Yes** | Explicit Core API URL in recommended `.env` |
| `final_console_gateway_checklist.md` | No | **Yes** | Core path + `8080` health checks in optional wiring |
| `private_pwa_deployment_hardening.md` | No | **Yes** | Explicit `8080` in dedicated Mac `.env` block |
| `package_20_final_safety_audit_operator_handoff.md` | No | **Yes** | Active Gateway→Core env uses `8080` (not `<core-port>`) |
| `scripts/README.md` | No | **Yes** | Full standalone paths for bridge smoke comments |
| `docker/README.md` | No | No | Correct `console` checkout path |
| `launch-windows.ps1` | No | No | Comment references Mac primary path |
| `Dockerfile` / `docker-compose.yml` | No | No | Compatibility assets; no nested layout references |
| Historical package notes (`package_00`–`package_20a`) | No nested paths | No | Retain pre-rename `/odysseus` paths as historical |
| Bridge package notes (`package_bridge_*`) | **Yes** | No | Historical — temporary nested `/Nexus/nexus_*` workspace |

## Gateway-to-Core API connectivity matrix

| Console route | Core target | Core status (system pass) | Console behavior | Notes |
|---------------|-------------|---------------------------|------------------|-------|
| `GET /api/nexus/v1/health` | `GET /health` | Implemented | Probes Core when `NEXUS_CORE_URL` set; enriches with `deployment_warnings` | Verified by unit test |
| `POST /api/nexus/v1/intake` | `POST /intake` | Implemented | Forward-only via `_forward_post_to_core` | No local execution |
| `POST /api/nexus/v1/messages` | `POST /messages` | Implemented | Forward; 404 → `/intake` fallback | `message_path: intake_fallback` on 404 |
| `POST /api/nexus/v1/sources` | `POST /source-packets`, fallback `/intake` | Contract-only on Core | Tries `/source-packets`; 404 → `/intake` | Verified by unit test |
| `POST /api/nexus/v1/worker-output` | `POST /worker-outputs`, fallback `/intake` | Contract-only on Core | Tries `/worker-outputs`; 404 → `/intake` | Verified by unit test |
| `GET /api/nexus/v1/packets` | `GET /tasks` | Implemented | Passthrough when Core reachable; placeholder if unconfigured | Read-only |
| `GET /api/nexus/v1/stream/{packet_id}` | Future events | Placeholder on Core | Gateway SSE placeholder; no local agent output | Honest pending message |
| `GET /api/nexus/v1/approvals` | `GET /approvals` | Contract-only on Core | Placeholder with empty queue when Core 404/unavailable | Does not fake approvals |
| `POST /api/nexus/v1/approvals/{id}/resolve` | `POST /approvals/{id}/resolve` | Contract-only on Core | Forward-only; returns `core_error` if Core missing endpoint | No local execution |
| `GET /api/nexus/v1/workers`, `/tools`, `/connectors`, `/housekeeping` | Future Core registry | N/A | Gateway read placeholders | Dashboard catalog surfaces |

## Final Console run/check commands

```bash
cd /Users/bretthoffman/Documents/console
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

Recommended `.env` (never commit secrets):

```env
NEXUS_CONSOLE_MODE=true
AUTH_ENABLED=true
LOCALHOST_BYPASS=false
APP_BIND=127.0.0.1
NEXUS_CORE_URL=http://127.0.0.1:8080
NEXUS_GATEWAY_SHARED_SECRET=<set locally; never commit>
```

Health check:

```bash
curl -sS http://127.0.0.1:7860/api/nexus/v1/health
```

## Final two-terminal smoke commands

**Terminal 1 — Nexus Core:**

```bash
cd /Users/bretthoffman/Documents/system
./start-core-api.sh
```

**Terminal 2 — legacy local console:**

```bash
cd /Users/bretthoffman/Documents/console
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

**Verify health (both services):**

```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:7860/api/nexus/v1/health
```

**Optional safe intake (no secrets; Core must be running with matching gateway secret in both `.env` files):**

```bash
curl -sS -X POST http://127.0.0.1:7860/api/nexus/v1/intake \
  -H 'Content-Type: application/json' \
  -d '{"type":"ping","payload":{"note":"connectivity smoke"}}'
```

## Historical old path references remaining

| Location | Path pattern | Status |
|----------|--------------|--------|
| `docs/console_reform/package_bridge_*.md` (7 files) | `/Users/bretthoffman/Documents/Nexus/system`, `.../console` | **Historical** — bridge integration workspace snapshot |
| `docs/console_reform/package_00` … `package_19` | `/Users/bretthoffman/Documents/odysseus` | **Historical** — pre-rename checkout |
| `docs/console_reform/package_20a_*` | `/Users/bretthoffman/Documents/odysseus` | **Historical** — folder rename pass record |
| Active operator docs, scripts, tests | None nested | **Clean** |

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_console_path_api_connectivity.py \
  tests/test_nexus_folder_rename_compatibility.py \
  tests/test_nexus_final_safety_audit.py \
  tests/test_nexus_final_authority_hardening.py \
  tests/test_nexus_legacy_cleanup_archive.py \
  tests/test_nexus_final_audit_artifacts.py \
  tests/test_nexus_private_deployment_hardening.py \
  tests/test_nexus_legacy_ui_classification.py \
  tests/test_nexus_branding.py \
  tests/test_nexus_authority_demotion.py \
  tests/test_nexus_execution_surface_guards.py \
  tests/test_nexus_connector_email_calendar_guards.py \
  tests/test_nexus_approval_routes.py \
  tests/test_nexus_dashboard_skeleton.py \
  tests/test_nexus_upload_processing_guards.py \
  tests/test_nexus_upload_bridge.py \
  tests/test_nexus_source_worker_routes.py \
  tests/test_nexus_messages.py \
  tests/test_nexus_chat_demotion.py \
  tests/test_nexus_gateway_routes.py \
  tests/test_nexus_token_scopes.py \
  tests/test_nexus_packets.py \
  tests/test_console_mode.py
```

Repo grep for nested paths on active files: **no matches** outside `package_bridge_*` historical notes.

## Results

| Check | Result |
|-------|--------|
| Active operator files — no nested `nexus/nexus_*` paths | **Pass** |
| `start-macos.sh` syntax + repo-relative | **Pass** |
| `python3 -m compileall` | **Pass** (see test run output) |
| Focused Nexus pytest suite (23 files, incl. path/connectivity) | **Pass** — 258 tests |
| Live two-terminal E2E smoke | **Skipped** — not run in this pass (operator acceptance on Nexus Mac) |

## Risks

- Bridge package notes still show nested paths; operators should follow this note and `NEXUS_CONSOLE_OPERATOR_HANDOFF.md`, not bridge-era workspace paths.
- Core contract-only endpoints (`/source-packets`, `/worker-outputs`, `/approvals`) rely on Console fallbacks/placeholders until Core implements them.
- Gateway secret must match on both Console and Core when `NEXUS_CORE_URL` is set.
- Full pytest `--collect-only` still has 2 pre-existing collection errors (unchanged).

## Recommended next package/pass

**Core endpoint completion + bounded live E2E acceptance** — implement remaining Core contract endpoints (`/source-packets`, `/worker-outputs`, `/approvals`, resolve), then run the two-terminal smoke with intake/messages/packets/approvals against live Core and document operator acceptance results.
