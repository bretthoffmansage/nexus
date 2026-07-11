# Package Bridge 00 — Nexus Core ↔ legacy local console Integration Audit

| Field | Value |
|-------|-------|
| **Package** | Bridge 00 — Integration audit (read-only) |
| **Date** | 2026-06-02 |
| **Repos audited** | `system` (Core), `console` (Console/Gateway) |
| **Workspace paths** | `/Users/bretthoffman/Documents/Nexus/system`, `/Users/bretthoffman/Documents/Nexus/console` |
| **Implementation** | None — audit only |

## Executive summary

**legacy local console/Gateway is wired and ready to forward.** Packages 1–20 in `console` added `/api/nexus/v1/*` routes, packet normalization, Console Mode demotion guards, and an httpx client that POSTs to `{NEXUS_CORE_URL}/intake` (and related paths) when configured.

**Nexus Core has no runnable HTTP API today.** `system` is a scaffold: contracts, JSON schemas, Hermes runtime launcher, task/worker/tool-factory directories, and tests — but **no FastAPI/uvicorn server** and **no implemented `/health` or `/intake` handlers**. `./start-nexus.sh` without `--doctor` exits with *"Runtime package is pending"* unless Hermes is installed and `runtime/start-hermes-nexus.sh` runs `exec hermes` (CLI runtime, not Core HTTP).

**First bridge test is blocked on Core, not Console.** To pass the target test (Core up → Console up → `GET /api/nexus/v1/health` → `POST /api/nexus/v1/intake` → Core returns accepted/ok), the smallest missing work is a **minimal Core HTTP intake server** in `system`.

---

## 1. How to run `system` (Nexus Core)

### Startup commands

| Command | Result |
|---------|--------|
| `./start-nexus.sh --doctor` | **Works today.** Runs `runtime/doctor.sh` or skeleton checks (`nexus.yaml`, `core/`, `runtime/`). Credential-free. |
| `python3 -m unittest discover -s tests` | **Works today.** Schema/structure tests only. |
| `./start-nexus.sh` | **Fails** unless `runtime/start-hermes-nexus.sh` is executable and `hermes` is on PATH → then **`exec hermes`** (Hermes CLI, not Core HTTP). |
| `scripts/nexusctl doctor` | Scaffold CLI; gateway command is placeholder. |

There is **no documented Core HTTP startup command** (no uvicorn, no `interfaces/http_api` server module).

### Expected port

- **None assigned in repo.** Console `.env.example` suggests `NEXUS_CORE_URL=http://127.0.0.1:8080` as an example only.
- Hermes runtime has **no HTTP listen port** in this repo.

### Environment variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY` | `runtime/hermes-env.example` | Hermes / Vercel AI Gateway (runtime LLM path, not Gateway bridge) |
| `runtime/.env.local` | Sourced by `runtime/start-hermes-nexus.sh` | Local Hermes overrides |

No `NEXUS_CORE_PORT`, `NEXUS_GATEWAY_SHARED_SECRET`, or Core HTTP bind vars exist in `system`.

### Core API exists?

**Contract only.** Documented in `gateway_contract/core_api_contract.md`. **No implementation.**

### Health / intake endpoints (Core)

| Endpoint | Contract | Implemented |
|----------|----------|-------------|
| `GET /health` | Yes | **No** |
| `POST /intake` | Yes | **No** |
| `POST /messages` | Yes | **No** |
| `POST /source-packets` | Yes | **No** |
| `POST /worker-outputs` | Yes | **No** |
| `GET /tasks`, `GET /tasks/{id}` | Yes | **No** |
| `GET /events` | Yes | **No** |
| `POST /approvals/{id}/resolve` | Yes | **No** |
| `GET /approvals` | **Not in Core contract** | **No** (Console Gateway calls it anyway) |

`config/interface_registry.yaml`: `http_api` and `gateway_api` are **planned/scaffolded**.

---

## 2. How to run `console` (legacy local console / Gateway)

### Startup command

```bash
cd /Users/bretthoffman/Documents/Nexus/console
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

Alternative (manual):

```bash
cd /Users/bretthoffman/Documents/Nexus/console
source venv/bin/activate   # after first ./start-macos.sh setup
NEXUS_CONSOLE_MODE=true python -m uvicorn app:app --host 127.0.0.1 --port 7860
```

Docker: `docker compose up` — default host port **7000** (not recommended for Nexus Mac; native `start-macos.sh` preferred).

### Expected port

| Context | Host | Port |
|---------|------|------|
| macOS native (`start-macos.sh`) | `127.0.0.1` (default) | **7860** |
| Docker Compose | `127.0.0.1` (default) | **7000** |
| Override | `APP_BIND` / `ODYSSEUS_HOST` | `APP_PORT` / `ODYSSEUS_PORT` |

### Environment variables (Nexus-relevant)

| Variable | Default | Role |
|----------|---------|------|
| `NEXUS_CONSOLE_MODE` | off | `true` → Console/Gateway shell; disables competing in-process authority |
| `NEXUS_CORE_URL` | unset | Base URL for Core forward/probe (e.g. `http://127.0.0.1:8080`) |
| `NEXUS_GATEWAY_SHARED_SECRET` | unset | Sent as `X-Nexus-Gateway-Secret` on Core requests |
| `ODYSSEUS_INPROCESS_TASKS` | `1` | Ignored when Console Mode on |
| `ODYSSEUS_INPROCESS_POLLERS` | `1` | Ignored when Console Mode on |
| `APP_BIND`, `APP_PORT` | `127.0.0.1`, `7000` | Bind/port (7860 on macOS script) |
| `AUTH_ENABLED`, `LOCALHOST_BYPASS` | `true`, `false` | Auth posture |

### `NEXUS_CONSOLE_MODE`

**Exists and is respected.** Implemented in `src/console_mode.py`; truthy values: `1`, `true`, `yes`, `on`.

When enabled, startup skips (see `app.py` startup):

- In-process task scheduler (`inprocess_tasks_enabled()` → false)
- Default scheduled task seeding (`ensure_defaults`)
- Email in-process pollers (`inprocess_pollers_enabled()` → false)
- `bg_monitor` (background agent auto-continuation)
- Nightly skill audit loop
- MCP `connect_all_enabled` at startup

### `ODYSSEUS_INPROCESS_TASKS` / `ODYSSEUS_INPROCESS_POLLERS`

**Respected when Console Mode is off.** When `NEXUS_CONSOLE_MODE=true`, both are **forced off** regardless of env (Package 1).

### Old Odysseus agent runtime in Nexus mode

**Demoted, not removed.**

| Path | Console Mode behavior |
|------|----------------------|
| `POST /api/chat`, `POST /api/chat_stream` | → `nexus_chat_bridge` → `forward_message()` (no local LLM/agent) |
| `POST /api/v1/chat` | → `console_mode_sync_chat()` |
| `stream_agent_loop()` | Early return with `local_execution_disabled` SSE |
| Gateway `/api/nexus/v1/*` | Never imports or calls agent loop |

Legacy agent paths remain in codebase but are gated. **Legacy mode** (`NEXUS_CONSOLE_MODE` off) restores full Odysseus autonomy.

---

## 3. Gateway routes in `console`

Registered in `routes/nexus_routes.py` via `setup_nexus_routes()`; prefix **`/api/nexus/v1`**.

### Required audit routes

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| GET | `/api/nexus/v1/health` | **Implemented** | Probes `{NEXUS_CORE_URL}/health` when configured; auth-exempt |
| POST | `/api/nexus/v1/intake` | **Implemented** | Normalizes packet → `forward_intake()` → `POST {core}/intake` |
| POST | `/api/nexus/v1/messages` | **Implemented** | → `POST {core}/messages` with `/intake` fallback on 404 |
| GET | `/api/nexus/v1/packets` | **Implemented (placeholder)** | Empty list; `persistence_not_implemented` |
| GET | `/api/nexus/v1/stream/:packet_id` | **Implemented (placeholder SSE)** | Single placeholder event + `[DONE]`; no Core stream relay yet |

### Additional Gateway routes (beyond audit checklist)

| Method | Path | Core target | Status |
|--------|------|-------------|--------|
| POST | `/api/nexus/v1/sources` | `/source-packets` | Forward + intake fallback |
| POST | `/api/nexus/v1/worker-output` | `/worker-outputs` | Forward + intake fallback |
| GET | `/api/nexus/v1/packets/{packet_id}` | — | Placeholder detail |
| GET | `/api/nexus/v1/workers` | — | Placeholder |
| GET | `/api/nexus/v1/tools` | — | Placeholder |
| GET | `/api/nexus/v1/connectors` | — | Placeholder |
| GET | `/api/nexus/v1/housekeeping` | — | Placeholder |
| GET | `/api/nexus/v1/approvals` | `GET /approvals` | Forward or placeholder |
| POST | `/api/nexus/v1/approvals/{id}/resolve` | `POST /approvals/{id}/resolve` | Forward |

Contract doc `system/gateway_contract/gateway_api_contract.md` also lists future routes (`/events`, `/deliver`, `/audits/{id}`) — **not implemented** in Console.

---

## 4. Core routes in `system`

**All are contract/documentation only** (`gateway_contract/core_api_contract.md`). No Python route handlers found.

| Method | Path | Contract | Code |
|--------|------|----------|------|
| GET | `/health` | Yes | **Missing** |
| POST | `/intake` | Yes | **Missing** |
| POST | `/messages` | Yes | **Missing** |
| POST | `/source-packets` | Yes | **Missing** |
| POST | `/worker-outputs` | Yes | **Missing** |
| GET | `/tasks` | Yes | **Missing** |
| GET | `/tasks/{id}` | Yes | **Missing** |
| GET | `/events` | Yes | **Missing** |
| POST | `/approvals/{id}/resolve` | Yes | **Missing** |
| GET | `/approvals` | **Not in Core contract** | **Missing** (Console expects it) |

---

## 5. Packet schema comparison

Schemas live in `system/gateway_contract/schemas/`. Normalization in `console/src/nexus_packets.py`.

### Envelope fields

Both sides agree on field **names** (see `packet_envelope.md` / `ENVELOPE_FIELDS`):

`packet_id`, `type`, `route`, `source_id`, `reply_channel`, `payload`, `created_by`, `created_at`, `workspace`, `priority`, `permissions`, `status`, `parent_packet_id`, `trace_id`, `audit_required`

### Compatibility status: **partial — drift on validation semantics**

| Topic | Core (`system`) | Console Gateway | Agree? |
|-------|-------------------------|-----------------|--------|
| **Packet types** | 8 enum values | Same 8 in `ALLOWED_PACKET_TYPES` | Yes |
| **status enum** | `new`, `queued`, `in_progress`, `needs_approval`, `blocked`, `complete`, `failed` | `new`, `accepted`, `processing`, `completed`, `failed`, `cancelled`, `rejected` | **No** |
| **reply_channel** | JSON Schema: `string \| null` | Preserves any JSON (often `object` for chat/upload) | **Partial** — Core schema stricter than Console practice |
| **Intake body** | Full envelope required in schema; task payload requires `objective` + `context` | Accepts partial body; fills defaults; extra keys → `payload` | **Partial** — Console more permissive |
| **Message payload** | Requires `payload.message` | `create_chat_message_packet()` satisfies | Yes (when using chat bridge) |
| **Worker output payload** | Requires `task_id`, `worker`, `summary` | Type forced to `worker_output`; payload not strictly validated | **Partial** |
| **Approval packet** | Full approval envelope in schema | Resolution uses separate flat body (`decision`, `resolved_by`, …) for resolve endpoint | **Partial** (different shapes for resolve vs packet) |
| **Gateway response** | `ok`, `packet_id`, `trace_id`, `status` (+ optional `message`) | Adds `core_configured`, `forwarded`, `core_status`, `core` | **Partial** — Console superset |
| **Core intake response** | Underspecified in repo | Console accepts any JSON with optional `ok`; defaults `ok=true` on HTTP 2xx | **Undefined** — needs Core stub contract |

### Examples

Core example task packet (`gateway_contract/examples/cli_task_packet.json`) uses `reply_channel: "stdout"` (string). Console chat uses `reply_channel: {"route":"chat","session_id":"..."}` (object). Both are forwarded as-is by Gateway; Core must accept structured reply channels even though JSON Schema currently says string-only.

---

## 6. Missing pieces for first bridge test

Target sequence:

1. Run Core locally
2. Run Console locally
3. `GET /api/nexus/v1/health` → Gateway ok, Core reachable
4. `POST /api/nexus/v1/intake` → Console forwards → Core returns accepted/ok

### Blockers (must have)

| # | Gap | Owner repo |
|---|-----|------------|
| 1 | **Runnable Core HTTP server** with at least `GET /health` and `POST /intake` | `system` |
| 2 | **Core listen port + start script** (recommend documenting `8080` and `./start-core-api.sh` or extending `start-nexus.sh`) | `system` |
| 3 | **Core intake JSON response** shape: `{ "ok": true, "status": "accepted", "packet_id", "trace_id" }` (align with Console `nexus_client._forward_post_to_core`) | `system` |
| 4 | **Operator `.env` on Console**: `NEXUS_CORE_URL=http://127.0.0.1:<port>` | deployment |
| 5 | **Optional but recommended**: Core validates `X-Nexus-Gateway-Secret` when env set | `system` |

### Already satisfied on Console side

- Gateway routes and httpx client (`src/nexus_client.py`)
- Packet normalization before forward (`src/nexus_packets.py`)
- Health auth exemption
- No local execution on Gateway paths
- Console Mode demotion (for dedicated Nexus Mac test)

### Nice-to-have (not required for minimal bridge)

- Align `status` enums between Console normalization and Core schemas
- Widen Core `reply_channel` schema to `string | object | null`
- Core `GET /approvals` (Console already calls it)
- Real Core event stream for `GET /api/nexus/v1/stream/{packet_id}`
- End-to-end test script in either repo

---

## 7. Risks

### Competing authority

| Risk | Severity | Finding |
|------|----------|---------|
| Console calls `agent_loop` for Nexus Gateway requests | **Low** | Gateway modules do not import `agent_loop`; tests enforce AST isolation |
| Console calls `agent_loop` for Nexus chat in Console Mode | **Low** | Chat routes branch to `nexus_chat_bridge`; `stream_agent_loop` self-blocks in Console Mode |
| Task scheduler / email pollers / bg_monitor in Console Mode | **Low** | Forced off at startup when `NEXUS_CONSOLE_MODE=true` |
| Nightly skill audit | **Low** | Skipped in Console Mode |
| Skill test / audit internal `stream_agent_loop` | **Low** | HTTP entry blocked via `_skills_authority_blocked`; loop would no-op if reached |

### Execution surfaces in Console Mode

| Surface | Guard | Residual risk |
|---------|-------|---------------|
| Shell | `block_local_execution("shell", …)` | Read-only admin routes may still exist; exec paths blocked |
| MCP | `block_local_execution("mcp", …)` + skip connect at startup | Config CRUD may work; tool execution blocked |
| Files / documents | `block_local_execution("file", …)` | Staging/download preserved; writes blocked |
| Research | `block_local_execution("research", …)` | Autonomous research start blocked |
| Email/calendar writes | `block_connector_write` | Read/list preserved |
| Memory/skills/model authority | `block_authority` | Read surfaces preserved |
| Cookbook model serve | `block_local_execution("cookbook", …)` | Local model **admin** surfaces still present (by design) |

### Routes that bypass Nexus Core

| Route class | Bypasses Core? | Notes |
|-------------|----------------|-------|
| `/api/nexus/v1/*` | No — forward-only or placeholder | Correct for Gateway |
| `/api/chat*` (Console Mode) | Forwards messages to Core when URL set; **does not execute locally** | OK |
| Legacy Odysseus routes (Console Mode off) | **Yes — full local autonomy** | Expected; do not use on Nexus Mac |
| `/api/nexus/v1/packets`, `/stream/*` | Placeholder only — **no Core truth** | Honest stubs; not authority bypass |
| Cookbook / Ollama / Settings | Local model infra | Not Nexus task authority; still reachable in Console Mode for admin |
| `GET /api/nexus/v1/health` unauthenticated | Information disclosure of Gateway/Core reachability | Mirrors `/api/health`; acceptable on loopback |

### Contract drift

- Console **status** values may be rejected if Core validates strictly against JSON Schema.
- Console calls **`GET /approvals`** but Core contract omits it.
- Core **does not exist** — any forward today ends in `core_unreachable` or `core_not_configured`.

---

## 8. Recommended next implementation package

### **Package Bridge 01 — Minimal Core HTTP intake server** (`system`)

Smallest package to make the first bridge test pass:

1. Add `interfaces/http_api/` (or `core/http_server.py`) — minimal FastAPI app:
   - `GET /health` → `{ "ok": true, "status": "ok", "service": "nexus-core" }`
   - `POST /intake` → validate gateway secret header if configured; accept normalized packet JSON; persist to in-memory or sqlite stub; return `{ "ok": true, "status": "accepted", "packet_id", "trace_id" }`
2. Add `start-core-api.sh` (or extend `start-nexus.sh --http`) — uvicorn on **`127.0.0.1:8080`** (match Console `.env.example`).
3. Env: `NEXUS_CORE_BIND`, `NEXUS_CORE_PORT`, `NEXUS_GATEWAY_SHARED_SECRET` (mirror Console header name).
4. Tests: `tests/test_core_http_intake.py` — health + intake without Hermes/live AI.
5. Document in `system/README.md` and cross-link from Console operator handoff.

**Explicitly out of scope for Bridge 01:** task loop, workers, Tool Factory execution, Hermes, `/messages` processing, event streams, approvals queue logic.

### Console-side follow-up (Bridge 02, optional)

- Integration test: spin Core stub + Gateway TestClient with `NEXUS_CORE_URL`
- Align status enum or document Gateway→Core mapping layer
- Update Core contract to include `GET /approvals` if Gateway keeps forwarding it

---

## Quick reference

| Item | Value |
|------|-------|
| **Core run (today)** | `./start-nexus.sh --doctor` only; no HTTP Core |
| **Core run (needed)** | `./start-core-api.sh` → `http://127.0.0.1:8080` (proposed) |
| **Console run** | `NEXUS_CONSOLE_MODE=true ./start-macos.sh` → `http://127.0.0.1:7860` |
| **Console → Core env** | `NEXUS_CORE_URL`, `NEXUS_GATEWAY_SHARED_SECRET` |
| **Gateway routes** | Implemented (see §3) |
| **Core routes** | Contract only (see §4) |
| **Packet compatibility** | Partial — envelope aligned; status/reply_channel/intake strictness drift |
| **Bridge test blocker** | Core HTTP server missing |

---

*End of Bridge 00 integration audit.*
