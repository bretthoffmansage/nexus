# Claudia Console Browser Chat Direct JSON Bridge Fix Pass

**Package / pass name:** Claudia Console Browser Chat Direct JSON Bridge Fix Pass  
**Date / time:** 2026-06-03 (local)  
**Repo path:** `/Users/bretthoffman/Documents/claudia_console`

## Root cause

Browser Chat in Console Mode used `POST /api/chat_stream` (SSE). The backend successfully forwarded to Core/Hermes and incurred provider cost, but the frontend SSE parser/render path failed to reliably surface `core.response.content`, producing a blank “Claudia” assistant bubble after the spinner cleared.

Direct curl to `POST /api/claudia/v1/messages` returned the same Hermes content correctly in JSON (`core.response.content`), proving the Gateway/Core path works and the loss was in SSE client handling.

## Files changed

| File | Change |
|------|--------|
| `static/js/claudiaBrowserChatBridge.js` | Added `sendBridgeMessage()`, `resolveAssistantContent()`, `EMPTY_CONTENT_FALLBACK`; improved `extractAssistantContent()` |
| `static/js/chat.js` | When `shouldUseBridge()`, POST JSON via `sendBridgeMessage()` and return before `/api/chat_stream` |
| `tests/test_claudia_browser_chat_bridge_ui.py` | Updated static tests for direct JSON path |
| `docs/claudia_console_reform/browser_chat_direct_json_bridge_fix.md` | This note |

## Behavior changed

- Console Mode + Core configured: browser Chat uses **`POST /api/claudia/v1/messages`** (JSON), not SSE.
- Assistant content extracted from `core.response.content` with ordered fallbacks.
- Empty extraction renders diagnostic: “Claudia Core responded, but no assistant content was returned.”
- Model picker refresh unchanged (stream `finally` + autohide bypass).

## Behavior intentionally unchanged

- `/api/chat_stream` backend and SSE path for legacy/non-bridge chat.
- Gateway `/api/claudia/v1/messages` backend.
- Model selector Gateway wiring (`/model-config`).
- Agent/Chat toggle visibility.
- No Hermes, provider, or `~/.hermes/config.yaml` access from frontend.

## Browser chat route behavior

When `shouldUseBridge()` (Core configured via model-config):

1. Ensure bridge session (existing `ensureClaudiaBridgeSession`).
2. Add user bubble (existing flow).
3. Show “Sending to Claudia Core” spinner.
4. `POST /api/claudia/v1/messages` with `{ message, session_id }`.
5. Render markdown assistant bubble from returned content.
6. `return` before legacy stream fetch.

## Response extraction behavior

Priority in `extractAssistantContent()`:

1. `core.response.content`
2. `core.response.message`
3. `core.message` / `core.error`
4. Top-level `message` (gateway errors)
5. Legacy SSE fields (`delta`, `response` string)

`resolveAssistantContent()` applies `EMPTY_CONTENT_FALLBACK` when all are empty.

## Blank bubble prevention

- `resolveAssistantContent()` never returns empty string.
- Bridge render path uses `bridgeResult.content || EMPTY_CONTENT_FALLBACK`.
- HTTP/network failures use `getCoreUnavailableMessage()`.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_claudia_browser_chat_bridge_ui.py
```

*(Results below.)*

**Results:** 13 passed (`tests/test_claudia_browser_chat_bridge_ui.py`); `bash -n start-macos.sh` OK; `compileall` OK.

## Risks

- Non-streaming UX: user waits for full Core/Hermes round-trip with no token streaming (acceptable for now).
- Agent mode with bridge active also uses direct JSON (backend already demotes local agent in Console Mode).
- Attachments/web/research toggles on bridge path are not forwarded in JSON payload yet (Console Mode typically disables those surfaces).

## Recommended live browser smoke

1. Restart Console at `http://127.0.0.1:7860`.
2. Hard-refresh browser.
3. Confirm model selector shows Core model.
4. Send Chat mode message.
5. Confirm visible Hermes response text (not blank bubble).
6. Confirm model selector remains visible after response.

---

## Matrix 1 — Browser chat transport

| Condition | Before | After | Endpoint | Streaming? |
|-----------|--------|-------|----------|------------|
| Console Mode + Core configured + Chat mode | SSE `/api/chat_stream` → blank bubble | Direct JSON bridge | `POST /api/claudia/v1/messages` | No |
| Core unavailable | Claudia error (dismissible) | Unchanged | Blocked at session or error JSON | No |
| Legacy mode | Local SSE stream | Unchanged | `POST /api/chat_stream` | Yes |
| Future streaming | N/A | Revisit SSE or packet stream later | TBD | TBD |

## Matrix 2 — Response extraction

| Response shape | Content source | Fallback |
|----------------|----------------|----------|
| `core.response.content` | Primary field | — |
| `core.response.type = execution_disabled` | `content` or `message` | `core.message` |
| `core.response.type = hermes_error` | `content` or `message` | `core.message` |
| Gateway/Core unavailable | `message` / `getCoreUnavailableMessage()` | Claudia-specific text |
| No content returned | — | `EMPTY_CONTENT_FALLBACK` |

## Matrix 3 — UI result

| Event | Before | After |
|-------|--------|-------|
| Send message | User bubble + SSE spinner | User bubble + JSON pending spinner |
| Waiting | “Sending to Claudia Core” (SSE) | Same label, awaiting JSON |
| Hermes success | Blank Claudia bubble | Rendered assistant markdown |
| Hermes error | Blank or generic | Visible error/content text |
| Empty content | Blank bubble | Diagnostic fallback string |
| Model selector after response | Sometimes missing | Refreshed via existing `finally` |
