# Claudia Console Model Selector Gateway/UI Wiring Pass

| Field | Value |
|-------|-------|
| **Package/pass name** | Claudia Console Model Selector Gateway/UI Wiring Pass |
| **Date/time** | 2026-06-03 |
| **Repo path** | `/Users/bretthoffman/Documents/claudia_console` |
| **Core API** | `http://127.0.0.1:8080` (`GET/POST /model-config`) |
| **Prior notes** | `console_path_api_connectivity_verification.md`, Core `docs/claudia_model_config_bridge.md` |

## Objective

Wire the chat-bar **Select model** control to Claudia Core’s Hermes model config via Console Gateway — forward-only, no local Hermes YAML writes, no direct model provider calls.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_client.py` | `get_model_config()`, `update_model_config()`, `_merge_core_model_config_payload()` |
| `routes/claudia_routes.py` | `GET/POST /api/claudia/v1/model-config` |
| `static/js/claudiaModelSelector.js` | **New** — Gateway fetch/POST for Core model config |
| `static/js/modelPicker.js` | Core selector path when Gateway reports Core configured |
| `static/style.css` | Minimal current-model / unavailable styling |
| `tests/test_claudia_model_config_gateway.py` | **New** — Gateway forward/auth tests |
| `tests/test_claudia_model_selector_ui_static.py` | **New** — Frontend wiring static checks |
| `docs/claudia_console_reform/model_selector_gateway_ui_wiring.md` | **New** — this note |

## Behavior changed

- **Gateway:** `GET/POST /api/claudia/v1/model-config` forward to Core when `CLAUDIA_CORE_URL` is set.
- **UI:** When Core is configured, chat-bar model picker reads Core allowlist and active model; selection POSTs to Gateway → Core.
- **Failure UX:** Shows “Core model config unavailable” or “No Core model options configured” instead of misleading “No models connected”.

## Behavior intentionally unchanged

- Legacy Add Models (+) / Settings → Added Models surfaces
- Local model endpoint admin, Ollama/Cookbook, `/api/model-endpoints/*`
- When `CLAUDIA_CORE_URL` unset, legacy model picker behavior unchanged
- Console Mode safety guards, auth model (session + bearer scopes)
- Core owns validation and `~/.hermes/config.yaml` writes

## Gateway routes added

| Method | Path | Auth | Forwards to |
|--------|------|------|-------------|
| `GET` | `/api/claudia/v1/model-config` | Session or `claudia_read` | Core `GET /model-config` |
| `POST` | `/api/claudia/v1/model-config` | Session or `claudia_admin` | Core `POST /model-config` body `{"model":"..."}` |

## UI behavior

1. On picker init, fetch `GET /api/claudia/v1/model-config`.
2. If `core_configured` and data available: button shows current model label (or id); dropdown lists `available_models`; current row marked.
3. On select: `POST {"model": id}`; on success update button immediately.
4. Plus/settings button unchanged (legacy local admin).
5. Opening dropdown refreshes Core config.

## Model config authority

| Layer | Responsibility | Can write model config? | Notes |
|-------|----------------|-------------------------|-------|
| Console UI | Display + operator selection | **No** | POST to Gateway only |
| Console Gateway | Forward GET/POST | **No** | Never reads/writes Hermes YAML |
| Claudia Core | Allowlist validate + YAML update | **Yes** | Updates `model.default` only |
| Hermes config (`~/.hermes/config.yaml`) | Runtime model routing | Written by Core | Console never touches |
| `.env` | Secrets / runtime flags | N/A | Untouched |

## Gateway API route matrix

| Route | Method | Auth | Behavior | Calls Hermes? | Writes config locally? |
|-------|--------|------|----------|---------------|------------------------|
| `/api/claudia/v1/model-config` | GET | `claudia_read` / session | Forward to Core; honest unavailable if Core down | **No** | **No** |
| `/api/claudia/v1/model-config` | POST | `claudia_admin` / session | Forward `{"model"}`; return Core result | **No** | **No** |

## UI behavior matrix

| UI element | Before | After | Notes |
|------------|--------|-------|-------|
| Select model button | “Select model” / legacy session model | Core model label when configured | Tooltip shows full model id |
| Dropdown list | Legacy endpoint catalog | Core `available_models` when configured | Section “Claudia Core models” |
| “No models connected” | Shown when no local endpoints | Only when Core not configured (legacy path) | Core failures show explicit unavailable text |
| Plus/settings button | Opens Add Models | Unchanged | Legacy admin preserved |
| Added Models settings panel | Local endpoints | Unchanged | Not Claudia config source of truth |

## Failure state matrix

| Failure | UI behavior | API behavior |
|---------|-------------|--------------|
| Core not configured | Legacy picker (endpoints / “No models connected”) | `ok: false`, `status: core_not_configured` |
| Core unreachable | Button: “Core model config unavailable” | `ok: false`, `status: core_unreachable` |
| Core `/model-config` HTTP error | Unavailable message in dropdown | `ok: false`, `status: core_error` |
| Invalid model rejected by Core | Error toast; dropdown stays open | Core 422 forwarded in response |
| Empty allowlist | “No Core model options configured.” | `available_models: []` |

## Auth/security behavior

- **GET:** `authorize_claudia_read` — logged-in session or `claudia_read` bearer.
- **POST:** `authorize_claudia_admin` — logged-in session or `claudia_admin` bearer (same pattern as approval resolve).
- No unauthenticated model switching.
- Responses exclude secrets (`AI_GATEWAY_API_KEY`, gateway shared secret, etc.) — Core returns safe fields only.

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_model_config_gateway.py \
  tests/test_claudia_model_selector_ui_static.py \
  tests/test_claudia_console_path_api_connectivity.py \
  tests/test_claudia_folder_rename_compatibility.py \
  tests/test_claudia_final_safety_audit.py \
  tests/test_claudia_final_authority_hardening.py \
  tests/test_claudia_console_mode.py
```

Live E2E smoke: **not run** in this pass (operator acceptance).

## Recommended live smoke test

1. Terminal 1: `cd /Users/bretthoffman/Documents/claudia_system && ./start-core-api.sh`
2. Terminal 2: `cd /Users/bretthoffman/Documents/claudia_console && CLAUDIA_CONSOLE_MODE=true ./start-macos.sh`
3. Open Console, sign in, verify chat-bar model button shows current Hermes model.
4. Open dropdown, select different allowlisted model.
5. Verify `curl -sS http://127.0.0.1:8080/model-config` shows new `model`.
6. Verify `~/.hermes/config.yaml` `model.default` updated (Core wrote it).
7. Optional: `POST /api/claudia/v1/messages` smoke with new model active.

## Risks

- POST requires admin scope for bearer tokens; session users need login (matches approval resolve pattern).
- Legacy picker still active when Core URL unset — operators must set `CLAUDIA_CORE_URL`.
- Model switch does not update legacy session `model` field; chat uses Core Hermes routing.

## Follow-ups

- Surface Core `warnings` in dropdown when provider/base_url mismatch.
- Optional: disable legacy auto-default model selection entirely in Console Mode when Core configured.

## Recommended next step

**Live model selector smoke** (steps above) plus **Core endpoint completion + bounded live E2E acceptance** for messages/intake with switched model.
