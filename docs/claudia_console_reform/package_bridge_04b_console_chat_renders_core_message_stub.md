# Package Bridge 04B — Console chat renders Core message stub

| Field | Value |
|-------|-------|
| **Package** | Bridge 04B — Console chat renders Core message stub |
| **Date** | 2026-06-02 |
| **Repo** | `claudia_console` |

## Objective

Update the Claudia Console chat bridge so Console Mode chat forwards to Core `POST /messages` and renders `response.content` from Claudia Core’s message stub in the existing chat SSE/sync flow — without Odysseus `agent_loop`, Hermes, workers, or local tool execution.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_chat_bridge.py` | Render `core.response.content`; metadata; auth/unreachable fallbacks |
| `tests/test_claudia_chat_core_stub.py` | **New** — stub rendering, degraded paths, Gateway `/messages` |
| `scripts/test_claudia_gateway_bridge.sh` | Optional `/api/claudia/v1/messages` stub check |
| `scripts/README.md` | Bridge 04B note |
| `docs/claudia_console_reform/package_bridge_04b_console_chat_renders_core_message_stub.md` | **New** — this note |

## Chat route behavior

When `CLAUDIA_CONSOLE_MODE=true`:

| Route | Behavior |
|-------|----------|
| `POST /api/chat_stream` | Builds message packet → `forward_message()` → SSE with `delta` = Core stub content |
| `POST /api/chat` | Same forward path → sync JSON with `response` = Core stub content |
| `GET /api/chat/resume` | Unchanged disabled message |

Legacy Odysseus `stream_agent_loop` is not called on these paths (guarded in `chat_routes.py`).

## Core response rendering behavior

On successful Core forward (`forwarded: true`, `ok: true`):

1. Prefer `core.response.content` (or `core_body.response.content`)
2. Else Core top-level `message`
3. Else: `"Claudia Core accepted the message, but no response content was returned."`

SSE/sync payloads include metadata when present:

- `packet_id`, `trace_id`
- `core_mode`, `core_status`
- `response_type`, `response_role`, `response_execution`
- `core` (full Core JSON, no secrets)

Assistant text is duplicated as `response`, `message`, and SSE `delta` for UI compatibility.

## Degraded behavior

| Condition | User-visible reply | agent_loop |
|-----------|-------------------|------------|
| `CLAUDIA_CORE_URL` unset | Core not configured message | Not called |
| Core unreachable / timeout / error | Unreachable/unavailable message | Not called |
| Core HTTP 401 | Authentication failed message | Not called |
| Missing `response.content` | Safe fallback string | Not called |

## Tests / checks run

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
pytest -q tests/test_claudia_chat_core_stub.py
pytest -q tests/test_claudia_messages.py
pytest -q tests/test_claudia_chat_demotion.py
pytest -q tests/test_claudia_packets_passthrough.py
pytest -q tests/test_claudia_console_mode.py
bash -n ./scripts/test_claudia_gateway_bridge.sh
```

## Manual smoke test commands

**Terminal 1 — Core**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_system
./start-core-api.sh
```

**Terminal 2 — Console**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Terminal 3 — Gateway message**

```bash
curl -X POST http://127.0.0.1:7860/api/claudia/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"type":"message","route":"manual_test","payload":{"message":"Hello from Console Bridge 04B"}}'
```

Or:

```bash
./scripts/test_claudia_gateway_bridge.sh
```

**Browser UI**

1. Open `http://127.0.0.1:7860`, log in
2. Send a chat message in Console Mode
3. Expected assistant reply: `Claudia Core received your message: "...". Full task execution is not enabled yet.`

With `AUTH_ENABLED=true`, set `CLAUDIA_GATEWAY_BEARER_TOKEN` for curl/script tests.

## Known limitations

- Stub content only — not real Claudia/Hermes execution
- No Core event SSE relay (`/api/claudia/v1/stream/{id}` still placeholder)
- Chat still requires Console auth when enabled
- Gateway `/messages` route returns Gateway envelope + `core` body; chat bridge uses the same forward path internally

## Next recommended package

**Bridge 05 — Core event stream relay or operator packet dashboard UI**

- Wire `GET /api/claudia/v1/stream/{packet_id}` to Core when events exist, or
- Add read-only Console dashboard panel for `/api/claudia/v1/packets` (no execution)

---

*End of Bridge 04B implementation note.*
