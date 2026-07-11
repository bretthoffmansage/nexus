# Package 6 — Chat path demotion, phase 2: Nexus message packets and SSE relay

| Field | Value |
|-------|-------|
| **Package** | Package 6 — Chat path demotion, phase 2: Nexus message packets and SSE relay |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_05_chat_backend_demotion.md` |

## Objective

When `NEXUS_CONSOLE_MODE=true`, route browser and API chat submissions through Nexus Gateway message packets (type `message`) and forward to Nexus Core when configured. Emit frontend-safe SSE/JSON with packet/trace metadata. Never invoke Odysseus `stream_agent_loop`, `llm_call_async`, local models, shell, MCP, file tools, email/calendar, memory/skills writes, research, or task scheduler.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_packets.py` | `create_chat_message_packet()` — chat route, session `source_id`, `reply_channel` object |
| `src/nexus_client.py` | `forward_message()` → Core `POST /messages` with 404 fallback to `/intake`; `stream_packet_events()` placeholder SSE |
| `src/nexus_chat_bridge.py` | **New** — Console Mode chat stream/sync/resume → message packet + SSE/JSON |
| `routes/nexus_routes.py` | `POST /messages`, `GET /stream/{packet_id}` |
| `routes/chat_routes.py` | Console Mode uses bridge instead of static Package 5 fallback |
| `routes/webhook_routes.py` | Console Mode `/api/v1/chat` uses `console_mode_sync_chat` (message validation before forward) |
| `tests/test_nexus_messages.py` | **New** — message packet, routes, stream SSE, console bridge |
| `tests/test_nexus_chat_demotion.py` | Updated — expects `console_mode_chat_stream` before `stream_agent_loop` |
| `tests/test_nexus_gateway_routes.py` | Assertion text aligned with Core-unreachable message |
| `docs/console_reform/package_06_chat_to_nexus_messages.md` | **New** — this note |

**Unchanged helpers:** `src/chat_console_guard.py` remains for reference/static text; Package 6 routes no longer use it for primary chat paths.

**Frontend:** No changes (`static/js/chatStream.js` / `chat.js` consume `data:` JSON with `delta` field).

## New routes added

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/nexus/v1/messages` | `nexus_intake` (Bearer) or session when auth enabled | Normalize `type=message` packet; forward to Core |
| `GET` | `/api/nexus/v1/stream/{packet_id}` | `nexus_read` (Bearer) or session | Bounded placeholder SSE for packet status |

## Behavior changed

### legacy local console Mode (`NEXUS_CONSOLE_MODE=true`)

- **`POST /api/chat_stream`** — builds `create_chat_message_packet()`, calls `forward_message()`, returns SSE via `sse_from_gateway_result()` (`type: nexus_message`, `delta`, `packet_id`, `trace_id`, `[DONE]`). No `stream_agent_loop`.
- **`POST /api/chat`** — same packet forward; JSON envelope from `console_mode_sync_chat()`.
- **`GET /api/chat/resume/{session_id}`** — SSE explaining resume disabled (no detached agent attach).
- **`POST /api/v1/chat`** — message validation, then `console_mode_sync_chat()` (no `llm_call_async`).

### Gateway (any console/legacy mode)

- **`POST /api/nexus/v1/messages`** — accepts JSON; normalizes or builds chat message packet; forwards via `forward_message()`.
- **`GET /api/nexus/v1/stream/{packet_id}`** — placeholder SSE until Core event stream exists.

### Legacy mode (`NEXUS_CONSOLE_MODE` off)

Unchanged Odysseus chat/agent behavior.

## Behavior intentionally unchanged

- Package 1 startup kill switches, Package 2–4 Gateway health/intake/packets/scopes.
- No `/api/nexus/v1/sources`, worker-output, approvals, dashboard UI, packet persistence.
- No branding, Convex, Clerk, auth migration, Ollama removal, or `agent_loop.py` deletion.
- `POST /api/chat/stop`, `stream_status`, `inject_context` unchanged.
- Full production Core event streaming not implemented (placeholder only).

## Message packet behavior

`create_chat_message_packet()` produces Package 4 envelope with:

- `type`: `"message"`
- `route`: `"chat"`
- `source_id`: `chat:{session_id}` or `chat:anonymous`
- `reply_channel`: `{"route": "chat", "session_id": "<id>"}` when session present
- `payload`: `message` text plus safe metadata (`session_id`, `mode`, `preset_id` from form when present)
- `created_by`: `effective_user(request)` or explicit API owner
- `audit_required`: `true` (via normalization defaults)

Gateway `POST /messages` accepts either a full packet or shorthand `{ "message": "...", "session_id": "..." }` and normalizes before forward.

## SSE behavior

**Console chat stream (`POST /api/chat_stream`):**

```
data: {"type":"nexus_message","message":"...","delta":"...","packet_id":"...","trace_id":"...","ok":...,"status":"...","core_configured":...,"forwarded":...,"console_mode":true,"agent_disabled":true}

data: [DONE]
```

**Gateway stream (`GET /api/nexus/v1/stream/{packet_id}`):**

Placeholder events with `packet_id`, `status` (`stream_placeholder`), then `[DONE]`. No blocking indefinitely; no local agent output.

## Core-unconfigured behavior

`NEXUS_CORE_URL` unset → `forward_message()` returns `ok: false`, `status: core_not_configured`, `forwarded: false`. Chat SSE/JSON explains Core is not configured and **local agent did not run**.

## Core-unreachable behavior

Configured URL but connect/timeout/HTTP error → `status` in `core_unreachable`, `core_timeout`, `core_error`. User-visible text states Core is unavailable and **no local execution occurred**. Intake/message paths share `_forward_post_to_core()` messaging.

## Auth behavior

| Route | Bearer token | Session (cookie) |
|-------|--------------|------------------|
| `POST /api/nexus/v1/messages` | Requires `nexus_intake` when auth enabled | Allowed via `authorize_nexus_intake` |
| `GET /api/nexus/v1/stream/{packet_id}` | Requires `nexus_read` when auth enabled | Allowed via `authorize_nexus_read` |
| Browser `/api/chat_stream` | N/A (session) | Uses `effective_user` for `created_by` |

Legacy `POST /api/v1/chat` still requires legacy `chat` scope; Console Mode forwards message packet without local LLM.

## Chat routing behavior matrix

| Endpoint | Legacy mode behavior | Console Mode behavior after Package 6 | Local agent/LLM invoked in Console Mode? |
|----------|----------------------|---------------------------------------|------------------------------------------|
| **POST /api/chat_stream** | Agent or chat SSE via `stream_agent_loop` / `stream_llm` | Message packet → `forward_message()` → Nexus SSE | **No** |
| **POST /api/chat** | Sync `llm_call_async` + hooks | `console_mode_sync_chat()` → Gateway JSON | **No** |
| **GET /api/chat/resume/{session_id}** | Detached agent SSE | SSE: resume disabled in Console Mode | **No** |
| **POST /api/v1/chat** | Sync token chat `llm_call_async` | `console_mode_sync_chat()` after message validation | **No** |
| **POST /api/nexus/v1/messages** | N/A (Gateway) | Normalize + forward to Core `/messages` (404 → `/intake`) | **No** |
| **GET /api/nexus/v1/stream/{packet_id}** | N/A (Gateway) | Placeholder SSE (packet status) | **No** |

## `/api/chat` and `/api/v1/chat` decisions

- **`POST /api/chat`** — routed to Nexus message packet (low risk; same bridge as stream).
- **`POST /api/v1/chat`** — routed to `console_mode_sync_chat()` (replaces Package 5 static JSON only).

## Safety guarantees

1. Console Mode chat is Nexus-bound, not Odysseus-agent-bound.
2. No local agent/model/tool fallback if Core is unavailable.
3. Message packets use Package 4 envelope; chat route and session metadata preserved.
4. Gateway remains non-authoritative (forward only).
5. Package 5 guarantees preserved: no `stream_agent_loop` / `llm_call_async` on guarded paths in Console Mode.
6. Legacy mode unchanged when `NEXUS_CONSOLE_MODE=false`.

## Frontend files changed

None.

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_nexus_messages.py \
  tests/test_nexus_chat_demotion.py \
  tests/test_nexus_gateway_routes.py \
  tests/test_nexus_token_scopes.py \
  tests/test_nexus_packets.py \
  tests/test_console_mode.py
```

**Results:** compileall pass; **58 passed**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still reports 2 pre-existing collection errors (not fixed in this package):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- Core `/messages` may not exist yet; Gateway falls back to `/intake` on HTTP 404 only.
- Placeholder SSE does not stream real Core assistant tokens; users see Gateway status text until Package 7+ streaming.
- `GET /stream/{packet_id}` does not proxy Core events yet.

## Follow-ups

- Proxy Core `GET /events` (or equivalent) when Nexus Core exposes packet streams.
- Wire worker-output and source packet routes (Package 7).
- Optional: deprecate `chat_console_guard.py` static helpers if unused.

## Next recommended package

**Package 7 — Worker output and source packet routes**
