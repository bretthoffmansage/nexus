# Package 15 — Legacy Odysseus UI cleanup and module classification

| Field | Value |
|-------|-------|
| **Package** | Package 15 — Legacy Odysseus UI cleanup and module classification |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_14_visible_claudia_branding.md` |

## Objective

Classify legacy UI modules and lightly hide/relabel local-execution surfaces in Claudia Console Mode without deleting modules or changing backend authority.

## Files changed

| File | Change |
|------|--------|
| `routes/claudia_routes.py` | `GET /health` includes `claudia_console_mode` |
| `static/js/claudiaConsoleMode.js` | **New** — fetch flag, hide/relabel UI |
| `static/app.js` | Import + `initClaudiaConsoleMode()` at startup |
| `static/style.css` | Console Mode banner + hide rules |
| `static/landing.html` | Primary visible branding → Claudia |
| `tests/test_claudia_legacy_ui_classification.py` | **New** |
| `docs/claudia_console_reform/package_15_legacy_ui_module_classification.md` | **New** |

## Behavior changed

### Backend

`GET /api/claudia/v1/health` returns `claudia_console_mode: true|false` from `CLAUDIA_CONSOLE_MODE`.

### Frontend (when `claudia_console_mode` is true)

- `body.claudia-console-mode` class applied.
- Banner: “Claudia Console Mode — Local execution… routed through Claudia Core.”
- Hidden/disabled: shell button, deep research entry/start, email compose, memory tidy/import/add tab, skills add/audit, library new doc, document AI tidy, email AI reply/summarize (dynamic), task run-now badges.
- Relabeled tooltips on agent/shell/research controls.

### Landing page

Title, wordmark, hero, footer → Claudia (satirical body copy may still mention Odysseus historically).

## Behavior intentionally unchanged

- Packages 1–14 backend guards and gateway behavior.
- Auth, cookies, tokens, routes.
- Read/list/admin surfaces (email list, calendar view, memory browse, skills list, model admin, Claudia dashboard).
- Login page design.
- Module files not deleted; legacy JS still loads.

## Routes/frontend surfaces reviewed

`static/index.html`, `static/app.js`, tool rail, sidebar tools, memory/skills modals, chat composer, research panel, email reader, tasks UI, cookbook, gallery, compare, settings/admin, landing page, Claudia dashboard.

## Legacy module classification matrix

| Module/surface | Current UI entry | Classification | Console Mode treatment | Follow-up |
|----------------|------------------|----------------|------------------------|-----------|
| Claudia dashboard | Sidebar “Claudia Console” | Claudia Console module | visible | Core status/approvals |
| Chat / command center | Main chat + composer | Claudia Console module | visible; execution tools hidden | chat bridge only |
| Approvals | Dashboard card | Claudia Console module | visible | forward to Core |
| Packets / worker outputs | Gateway routes + dashboard | Claudia Console module | visible (placeholders) | persistence later |
| Email | Sidebar + rail | Read-only connector surface | list/read; compose + AI assist hidden | connector packets |
| Calendar | Sidebar + rail | Read-only connector surface | read/sync; event writes blocked (P11) | — |
| Documents / library | Library tool | Read-only + admin | browse; create/AI tidy hidden | more doc routes |
| Memory (Brain) | Sidebar tool | Mixed | browse/search visible; add/tidy/import hidden | in-process injection |
| Skills | Brain modal tab | Mixed | list/read visible; add/audit hidden | agent_loop skills |
| Tasks / scheduler | Sidebar Tasks | Hidden in Console Mode | UI visible; run-now hidden | scheduler P1 off |
| Shell | Composer bash btn | Hidden in Console Mode | hidden | P12 HTTP guard |
| MCP | Settings admin | Admin/status/config | list/status (no HTTP invoke route) | connect guarded P12 |
| Research | Sidebar + panel | Hidden in Console Mode | entry + start hidden; history TBD | P12 start guard |
| Cookbook / Ollama | Cookbook tool | Admin/status/config | visible (install/serve still present*) | execution paths review |
| Gallery | Sidebar | Future worker surface | visible | image gen review |
| Compare / eval | Compare tool | Future worker surface | visible | model calls review |
| Settings / admin | Settings rail | Admin/status/config | visible | — |
| Landing page | `/static/landing.html` | Legacy/internal retained | Claudia branding (hero) | satire copy optional |
| Presets / persona | Chat presets | Legacy/internal retained | Odysseus literary preset kept | intentional |
| Easter eggs | slashCommands | Legacy/internal retained | unchanged | — |

\*Cookbook install/serve controls remain visible; backend shell install guarded in P12.

## UI surfaces hidden or relabelled in Console Mode

### Hidden (or CSS `display:none`)

- `#bash-toggle-btn`, `#rail-research`, `#tool-research-btn`
- `#email-compose-btn`
- Memory: tidy, import, Add tab, session “Memory extract” action
- Skills: add, audit-all, bulk publish/audit
- `#library-new-doc-btn`, `#doclib-tidy-btn`
- `#research-start-btn` (panel)
- Email reader: `[data-act="ai-reply"]`, `[data-act="summarize"]`
- Tasks: `.task-card-run-btn`

### Relabelled

- Agent mode button tooltip → Claudia Core routing note
- Shell / research sidebar tooltips → disabled in Console Mode

### Remains visible

- Chat (packet bridge), Claudia Console dashboard, session list, models list, email/calendar/doc **read** UIs, settings, theme, cookbook status, gallery, compare, memory/skills **browse**.

## Read/admin/status surfaces preserved

Email list/read, calendar display, document library listing, memory/skills catalogs, model endpoint admin, Gateway health/dashboard, Ollama/cookbook configuration displays.

## Remaining Odysseus references

| Reference | Status |
|-----------|--------|
| Primary login/index/manifest (P14) | **Removed** from visible brand |
| `landing.html` satire/history paragraphs | **Intentionally kept** (non-primary) |
| `presets.js` Odysseus persona | **Intentionally kept** |
| `slashCommands.js` epic quote | **Intentionally kept** |
| `startOdysseusApp`, `odysseus-theme` | **Internal — unchanged** |
| CSS/JS file header comments | **Deferred** (non-user-visible) |
| `research/panel.js` example query | **Deferred** (Homer example) |

## Console Mode frontend signal behavior

1. On app startup, `initClaudiaConsoleMode()` fetches `GET /api/claudia/v1/health`.
2. Reads `claudia_console_mode` boolean (no auth required for health).
3. If true, applies `claudia-console-mode` class and UI gating.
4. `MutationObserver` re-applies hides for dynamically rendered email/task controls.

## Login/home design preservation status

**Unchanged.** No login layout/CSS edits in P15.

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_legacy_ui_classification.py \
  tests/test_claudia_branding.py \
  ... (P1–P14 Claudia tests)
```

## Results

- `compileall`: pass
- Focused Claudia tests (P1–P15): **136 passed**
- New P15 tests: **7 passed**

## Known pytest baseline issue from Package 0

Collect-only may still report 2 pre-existing errors in `tests/test_chat_image_routing.py` and `tests/test_webhook_ssrf_resilience.py`.

## Risks

- UI gating is frontend-only; direct API calls still hit P11–P13 guards.
- Dynamically created controls may briefly appear before observer runs.
- Cookbook/gallery/compare may still expose model execution paths not fully gated in UI.
- `startOdysseusApp` is now async; callers must tolerate promise (DOMContentLoaded still works).

## Follow-ups

- Extend hides to calendar event editor, MCP admin connect buttons, cookbook run/install.
- In-process agent_loop / memory injection audit (Package 16+).
- Optional dedicated `GET /api/claudia/v1/status` if health payload grows too large.

## Next recommended package

**Package 16 — Private/PWA deployment hardening**
