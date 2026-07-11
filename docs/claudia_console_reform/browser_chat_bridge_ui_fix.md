# legacy local console Browser Chat Bridge UI Fix Pass

**Package / pass name:** legacy local console Browser Chat Bridge UI Fix Pass  
**Date / time:** 2026-06-03 (local)  
**Repo path:** `/Users/bretthoffman/Documents/console`

## Summary

Fixed browser Chat mode so legacy local console routes messages through the existing Gateway → Core → Hermes bridge instead of legacy Odysseus local model/session validation. Preserved Core model selector visibility after send and made legacy warning cards dismissible.

## Files changed

| File | Change |
|------|--------|
| `static/js/nexusBrowserChatBridge.js` | **New** — detects Core model config, extracts bridge response text |
| `static/js/nexusConsoleMode.js` | Init bridge module at startup; expose on `window` |
| `static/js/sessions.js` | `ensureNexusBridgeSession()` — minimal session without local endpoint |
| `static/js/chat.js` | Bridge path before legacy session warning; SSE `nexus_message` parsing; model picker refresh in `finally` |
| `static/js/chatRenderer.js` | Dismissible warning UI (`msg-dismiss-btn`); Nexus role for bridge warnings |
| `static/app.js` | Skip model-picker autohide when bridge/Core selector active |
| `static/style.css` | `.msg-dismiss-btn` styles |
| `tests/test_nexus_browser_chat_bridge_ui.py` | **New** — static frontend bridge checks |
| `docs/console_reform/browser_chat_bridge_ui_fix.md` | This note |

**Intentionally unchanged:** `routes/nexus_routes.py`, `routes/chat_routes.py`, `src/nexus_chat_bridge.py` (backend bridge already worked via curl).

## Root cause

1. **`chat.js` `handleSubmit`** required a legacy session with a local model endpoint. With no session it fetched `/api/default-chat`; when no endpoint was configured it showed “No chat session active…” and **returned before** `/api/chat_stream`.
2. **Model selector disappearance:** `app.js` `_syncModelPickerAutohide` hides the picker when input length ≥ 10 characters. After send/clear, the picker was not reliably restored.
3. **Warning card × button:** Legacy assistant messages used the action footer delete path (`deleteMessage`), which fails for non-persisted informational messages. No dedicated dismiss handler existed.

## Behavior changed

- When `GET /api/nexus/v1/model-config` reports `core_configured: true`, Chat submit creates/uses a minimal bridge session and sends via existing `POST /api/chat_stream` (backend `console_mode_chat_stream` → Core).
- Legacy “No chat session active / pick a model endpoint” is **not shown** on the bridge path.
- Core-unavailable errors show Nexus-specific messages with `{ dismissible: true }`.
- SSE events `nexus_message`, `error`, and `validation_error` render via `extractAssistantContent()`.
- Model picker stays visible during/after bridge chat (autohide bypass + `finally` refresh).
- Dismissible warnings have a working × button that removes the message from the DOM.

## Behavior intentionally unchanged

- Backend bridge routes and Core forwarding logic.
- Legacy Odysseus chat when Core is not configured (non-Console or legacy deployments).
- Add Models UI, Ollama support, Agent/Chat toggle presence.
- Direct frontend calls to Hermes or `~/.hermes/config.yaml`.
- Agent mode UI label/tooling (backend still demotes local agent execution in Console Mode).

## Browser chat route behavior

**Chosen path:** Option B — continue using `POST /api/chat_stream`, which already routes to `console_mode_chat_stream` when `NEXUS_CONSOLE_MODE=true`. Smallest safe fix: fix frontend gating only.

Flow: `handleSubmit` → `ensureNexusBridgeSession()` → `/api/chat_stream` → Gateway `forward_message` → Core/Hermes → SSE `type: nexus_message` with `delta`.

## Model selector persistence behavior

- `_syncModelPickerAutohide` skips hide when `window.nexusBrowserChatBridge.shouldUseBridge()` is true.
- Stream `finally` calls `_syncModelPickerAutohide()` and `updateModelPicker()` so label/state restore after send.
- Selector continues to load/switch via `GET/POST /api/nexus/v1/model-config` (`nexusModelSelector.js` / `modelPicker.js`).

## Legacy warning behavior

- **Console Mode + Core configured:** “No chat session active” card is not emitted on the bridge path.
- **Legacy mode:** Warning may still appear when no local endpoint; now `{ dismissible: true }` with working ×.
- **Core unavailable:** Nexus-specific error text, dismissible, not Odysseus setup instructions.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_nexus_browser_chat_bridge_ui.py \
  tests/test_nexus_model_config_gateway.py \
  tests/test_nexus_model_selector_ui_static.py \
  tests/test_nexus_messages.py \
  tests/test_nexus_chat_demotion.py \
  tests/test_console_mode.py
```

*(Results recorded below after run.)*

**Results (2026-06-03):** All checks passed.

- `bash -n start-macos.sh` — OK  
- `python3 -m compileall -q app.py core routes src` — OK  
- `pytest` focused suite — **51 passed**, 2 warnings (deprecation only)

## Risks

- Bridge session is a minimal local DB session (empty endpoint/model) — required for existing chat_stream form contract; does not invoke local LLM when Console Mode backend guard is active.
- `shouldUseBridge()` keys off `core_configured` from model-config, not only `console_mode` flag — intentional so Core routing works whenever Gateway has Core URL.
- Agent mode toggle still visible; Console backend demotion prevents local agent loop but UX may still show agent chrome.

## Follow-ups

- Optional: direct `POST /api/nexus/v1/messages` from frontend for non-streaming one-shot UI (if SSE overhead is unwanted).
- Live browser smoke test (operator).
- Restore `.env.example` if missing (unrelated path/rename tests).

## Recommended live browser smoke test

1. Restart Console (`http://127.0.0.1:7860`).
2. Hard-reload browser.
3. Confirm chat-bar model selector shows Core active model from `/api/nexus/v1/model-config`.
4. Select **Chat** mode; send a message.
5. Confirm Hermes/Core response renders (assistant bubble, role “Nexus”).
6. Confirm model selector remains visible after response.
7. Switch model via selector; send another message; confirm new model label persists.
8. If testing legacy warning: in non-bridge mode, confirm × dismisses the card.

---

## Matrix 1 — Browser chat path

| Mode / condition | Before | After | Endpoint used | Local agent/model execution? |
|------------------|--------|-------|---------------|------------------------------|
| Console Mode + Core configured + Chat mode | “No chat session active” card; no bridge response | Bridge session + stream; Hermes content rendered | `POST /api/chat_stream` → Core | No |
| Console Mode + Core unavailable | Legacy local-model warning or hang | Nexus-specific error (dismissible) | None (blocked at session gate) | No |
| Legacy mode + local endpoint | Local Odysseus chat via endpoint | Unchanged | `POST /api/chat_stream` (legacy path) | Yes (legacy) |
| Agent mode in Console Mode | Could attempt local agent assumptions | Same bridge/demotion as backend Console guard | `POST /api/chat_stream` (Console branch) | No (backend demoted) |

## Matrix 2 — Model selector behavior

| Event | Before | After | Notes |
|-------|--------|-------|-------|
| Initial page load | Core selector when wired | Unchanged | `nexusModelSelector` + `modelPicker` |
| Open model dropdown | Core allowlist POST | Unchanged | Gateway `/model-config` |
| Send chat message | Picker often hidden (autohide) | Picker stays visible when bridge active | Autohide bypass |
| Receive chat response | Picker sometimes missing | Picker refreshed in stream `finally` | `updateModelPicker()` |
| Switch model after response | Broken if picker gone | Works | Selector not removed on send |

## Matrix 3 — Legacy warning behavior

| Warning / state | Before | After | Console Mode? |
|-----------------|--------|-------|---------------|
| No chat session active card | Shown; blocked send | Not shown on bridge path | Suppressed when Core configured |
| No models connected | Shown in legacy | Unchanged in legacy | N/A |
| Core unavailable | Odysseus-style hint | “Nexus Core is unavailable…” | Yes |
| Close “×” button | No-op (footer delete) | Removes message DOM | Both modes (dismissible) |

## Matrix 4 — Response parsing

| Response shape | Rendered content source | Notes |
|----------------|-------------------------|-------|
| `core.response.content` | `extractAssistantContent` → SSE `delta` | Primary Hermes path |
| `core.response.type = execution_disabled` | `content` or `message` from core | Shown as assistant text |
| `core.status = error` | `error` / `validation_error` SSE handler | No local-model warning |
| Gateway/Core unavailable | `getCoreUnavailableMessage()` | Pre-send or SSE error text |
