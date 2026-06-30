# Package 5 — Chat path demotion, phase 1: backend safety guard

| Field | Value |
|-------|-------|
| **Package** | Package 5 — Chat path demotion, phase 1: backend safety guard |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_04_packet_envelope_route_preservation.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, block legacy Odysseus chat endpoints from invoking local LLM/agent execution (`stream_agent_loop`, `llm_call_async`, tools). Return safe responses that explain Console Mode and that Claudia Core message routing is not enabled yet.

## Files changed

| File | Change |
|------|--------|
| `src/chat_console_guard.py` | **New** — safe JSON/SSE responses, shared message text |
| `routes/chat_routes.py` | Guards on `/api/chat`, `/api/chat_stream`, `/api/chat/resume` |
| `routes/webhook_routes.py` | Guard on `POST /api/v1/chat` (sync API token chat) |
| `tests/test_claudia_chat_demotion.py` | **New** — guard/SSE/source-order tests |
| `docs/claudia_console_reform/package_05_chat_backend_demotion.md` | **New** — this note |

## Behavior changed

### Claudia Console Mode (`CLAUDIA_CONSOLE_MODE=true`)

- **`POST /api/chat`** — immediate JSON fallback; no `llm_call_async`, no research, no post-response tasks.
- **`POST /api/chat_stream`** — immediate SSE (`type: claudia_console_mode`, `delta` + message, then `[DONE]`); no `stream_agent_loop`, no chat-mode `stream_llm`, no `agent_runs.start`.
- **`GET /api/chat/resume/{session_id}`** — same Console Mode SSE (does not attach to a detached agent run).
- **`POST /api/v1/chat`** (webhook sync) — JSON fallback; no `llm_call_async`; preserves `session_id` in response when provided.

### Legacy mode (`CLAUDIA_CONSOLE_MODE` off)

Unchanged chat behavior (subject to existing auth/scopes).

## Behavior intentionally unchanged

- Chat UI (`static/js/chat.js`) — no frontend edits.
- `POST /api/chat/stop`, `GET /api/chat/stream_status`, `POST /api/inject_context`, Gateway routes, packet normalization, token scopes, Ollama/Cookbook admin surfaces globally.
- No Claudia Core message streaming (`/api/claudia/v1/messages` not added).

## Chat endpoint behavior matrix

| Endpoint | Legacy behavior | Claudia Console Mode behavior | Agent loop invoked in Console Mode? |
|----------|-----------------|-------------------------------|-------------------------------------|
| **POST /api/chat** | Sync LLM via `llm_call_async`, memory/research hooks | JSON: `console_mode_chat_json()` | **No** (no LLM, no agent) |
| **POST /api/chat_stream** | Chat or agent SSE; agent path uses `stream_agent_loop` | SSE: `claudia_console_mode` + `[DONE]` | **No** |
| **GET /api/chat/resume/{session_id}** | Subscribe to detached `agent_runs` stream | Console Mode SSE (no resume) | **No** |
| **POST /api/chat/stop/{session_id}** | Stops detached run | Unchanged (harmless if no run) | N/A |
| **GET /api/chat/stream_status/{session_id}** | Reports active stream/run | Unchanged | N/A |
| **POST /api/v1/chat** | Sync token chat via `llm_call_async` | JSON fallback (+ `session_id` if given) | **No** (no LLM) |
| **POST /api/inject_context** | Injects context into session | Unchanged (no agent loop) | N/A |

## Claudia Console Mode fallback behavior

**JSON (`/api/chat`, `/api/v1/chat`):**

```json
{
  "response": "Claudia Console Mode is active. Local Odysseus chat execution is disabled. Claudia Core message routing is not enabled yet.",
  "claudia_console_mode": true,
  "agent_disabled": true
}
```

**SSE (`/api/chat_stream`, `/api/chat/resume`):**

```
data: {"type":"claudia_console_mode","message":"...","delta":"...","claudia_console_mode":true,"agent_disabled":true}

data: [DONE]
```

Does **not** claim Claudia Core handled the request. Does **not** call Ollama, local models, shell, MCP, email, calendar, memory, skills, research, or tasks.

## `/api/v1/chat` handling decision

**Changed in this package.** `POST /api/v1/chat` uses `llm_call_async` (local model execution), which competes with Claudia Core the same way agent chat does. It now returns the same Console Mode JSON fallback when `CLAUDIA_CONSOLE_MODE=true`. Token scope rules (`chat` scope) are unchanged.

## Safety guarantees

- Guards run before session preprocessing, tool routing, and LLM/agent calls on chat endpoints.
- `src/chat_console_guard.py` does not import `agent_loop`, `llm_core`, or tool stacks.
- No Claudia Core HTTP calls from the fallback path.
- Independent of Gateway routes being configured.

## Tests / checks run

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| `pytest -q tests/test_claudia_chat_demotion.py` | **Pass** (7 tests) |
| `pytest -q tests/test_claudia_packets.py` | **Pass** |
| `pytest -q tests/test_claudia_gateway_routes.py` | **Pass** |
| `pytest -q tests/test_claudia_token_scopes.py` | **Pass** |
| `pytest -q tests/test_claudia_console_mode.py` | **Pass** |
| Full pytest suite | **Not run** |

### Known pytest baseline (Package 0)

Pre-existing collect-only errors (unchanged):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

| Risk | Note |
|------|------|
| UI shows static message only | Phase 2 will route to Claudia Core streaming |
| Resume returns Console Mode SSE | Avoids re-attaching to pre-mode detached runs |
| `inject_context` still allowed | Does not invoke agent; documented as unchanged |
| Detached runs started before Console Mode | Stop manually or restart process |

## Follow-ups

1. **Package 6** — Chat path demotion, phase 2: Claudia message packets and SSE relay to Core.
2. Optional: block `inject_context` in Console Mode if policy requires.
3. Frontend handling for `claudia_console_mode` SSE type (optional polish).

## Next recommended package

**Package 6 — Chat path demotion, phase 2: Claudia message packets and SSE relay**

Route Console Mode chat through Claudia Core message/intake APIs with SSE relay instead of a static disabled message.

---

*End of Package 5 implementation note.*
