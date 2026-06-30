# Package 17 — Final competing-authority and legacy file classification audit

| Field | Value |
|-------|-------|
| **Package** | Package 17 — Final competing-authority and legacy file classification audit |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_16_private_pwa_deployment_hardening.md` |
| **Machine-readable** | `legacy_file_classification.json` |

## Objective

Read-only classification audit of remaining competing-authority runtime surfaces and legacy repository clutter before any controlled cleanup. **No files deleted, moved, or behavior changed.**

## Files changed

| File | Change |
|------|--------|
| `docs/claudia_console_reform/package_17_competing_authority_legacy_file_audit.md` | **New** — this audit |
| `docs/claudia_console_reform/legacy_file_classification.json` | **New** — machine-readable summary |
| `tests/test_claudia_final_audit_artifacts.py` | **New** — artifact presence checks |

## Behavior changed

**None.** Audit and documentation only.

## Behavior intentionally unchanged

Packages 1–16: Console Mode startup gates, Gateway routes, HTTP guards (chat, connectors, execution, authority, upload), branding, UI gating, deployment health warnings, auth, Ollama/model admin.

## Inspection commands run

```bash
find . -maxdepth 2 -type f -o -type d  # root inventory
grep -R "is_claudia_console_mode\|block_local_execution\|block_authority\|block_connector" routes src
grep -R "stream_agent_loop\|execute_tool\|TaskScheduler\|run_task_now" src routes services
grep -R "@router\.(post|put|patch|delete)" routes/task_routes.py routes/document_routes.py routes/cookbook_routes.py
# Manual review: app.py startup, package notes P12–P16, static branding samples
```

## Routes/surfaces/files reviewed

**Internals:** `src/agent_loop.py`, `task_scheduler.py`, `tool_execution.py`, `tool_implementations.py`, `agent_tools.py`, `mcp_manager.py`, `deep_research.py`, `memory.py`, `bg_monitor.py`, guard modules, `claudia_*` bridge/client modules.

**Routes (47 modules):** focus on `task_routes`, `assistant_routes`, `webhook_routes`, `document_routes`, `gallery_routes`, `compare_routes`, `cookbook_routes`, `model_routes`, `chat_routes`, `shell/mcp/research/email/calendar/memory/skills`, `claudia_routes`, `upload_routes`, `personal_routes`, `note_routes`.

**Root/deployment:** `Dockerfile`, `docker-compose.yml`, `docker/`, `start-macos.sh`, `launch-windows.ps1`, `setup.py`, `build-macos-app.sh`, `install-service.sh`, `odysseus-ui.service`, `scripts/`, `companion/`, `docs/`, `README.md`, `SECURITY.md`, `THREAT_MODEL.md`, `pyproject.toml`.

**UI/static:** `static/login.html`, `index.html`, `landing.html`, `manifest.json`, `sw.js`, `app.js`, `claudiaConsoleMode.js`, `claudiaDashboard.js`, major `static/js/*` modules (per P15 matrix).

**Data:** `data/` directory purpose noted; contents not read (may contain user secrets).

---

## Matrix 1 — Competing authority surface audit

| Surface/path | Current role | Console Mode guard status | Remaining risk | Recommendation |
|--------------|--------------|---------------------------|----------------|----------------|
| `src/agent_loop.py` | Full agent turn: LLM + `execute_tool_block` + MCP/shell/file tools | **Startup:** bg_monitor off; **HTTP:** chat/stream demoted to bridge (P5–P6). **No** global disable of module import. | Direct HTTP bypass if any route still calls `stream_agent_loop`; task/skill paths; tool execution via unguarded entrypoints. | **P19:** audit all `stream_agent_loop` call sites; consider hard guard at function entry in Console Mode. |
| `src/task_scheduler.py` | Cron-style tasks, `run_task_now`, invokes `stream_agent_loop` | **Startup:** scheduler not started (P1). **HTTP:** no route-level guard on `POST .../run`. | Manual `POST /api/tasks/{id}/run` or assistant run can still dispatch agent loop while Console Mode on. | **P19:** block `run_task_now` HTTP + assistant run in Console Mode. |
| `src/tool_execution.py` | Dispatches tool calls from agent loop | Indirect only (via agent_loop) | Shell/MCP/file tools if agent loop invoked | Guard at `execute_tool_block` entry in Console Mode (P19). |
| `src/tool_implementations.py` | Concrete tool handlers (files, email, tasks, etc.) | Indirect | Same as tool_execution | Same as tool_execution; classify per-tool in P19. |
| `src/agent_tools.py` | Tool registry / re-exports | Indirect | Same | Document tool allowlist for Console Mode. |
| `src/mcp_manager.py` | MCP connect, tool proxy | **HTTP:** add/reconnect/enable/OAuth connect blocked (P12). **Startup:** `connect_all_enabled` still runs. | MCP tools if agent loop runs; startup stdio spawns for enabled servers. | **P19:** skip or read-only MCP connect in Console Mode startup; block tool execution path. |
| `src/deep_research.py` | Multi-step research orchestration | **HTTP:** `POST /api/research/start` blocked (P12). History/read may remain. | Resume/poll paths; chat `use_research` injection on legacy mode only. | Audit research resume routes; UI hidden (P15). |
| `src/memory.py` | Memory store + injection helpers | **HTTP:** mutations blocked (P13). Reads allowed. | In-process injection into chat context if chat path regressed. | Verify chat bridge does not inject/write memory locally (P19). |
| `services/memory/skills.py` | Service-layer skill/memory helpers (if used by routes) | Not centrally gated | Call paths from skills routes after guard return | Trace imports in P19; likely legacy_only_candidate for some helpers. |
| `routes/task_routes.py` | CRUD + `run`/`stop` + webhooks for scheduled tasks | **Startup:** scheduler off. **HTTP:** **unguarded** writes and `run`. | **High:** `POST /{task_id}/run` triggers `task_scheduler.run_task_now` → agent loop. | **P19:** execution guard on run/stop/create/update; read-only list in Console Mode. |
| `routes/assistant_routes.py` | Personal assistant settings + `POST /run/{task_id}` | **HTTP:** **unguarded** | Same as task run | **P19:** block assistant run in Console Mode. |
| `routes/webhook_routes.py` | External `POST /api/v1/chat` + inbound webhooks | **Console Mode:** sync chat → `console_mode_sync_chat` (P6). Other webhook triggers not fully audited here. | Token-authenticated chat bypass if misconfigured | Keep bridge; audit non-chat webhook handlers in P19. |
| `routes/document_routes.py` | Library CRUD, AI tidy/fill, import PDF | **Partial (P12/P13):** create/update/delete/import_pdf, ai_tidy, ai_fill guarded. | **Partial:** `restore_version`, archive, non-AI writes unguarded; read/list OK. | **P19:** extend file guard to restore/archive or classify as allowed user edit. |
| `routes/gallery_routes.py` | Upload, albums, **image AI** (inpaint, upscale, etc.) | **None** | **High:** model/API image generation via many `POST /api/image/*` | **P19:** authority or execution guard on generative routes; UI still visible (P15). |
| `routes/compare_routes.py` | Creates sessions; client uses `/api/chat_stream` | **Indirect:** chat_stream guarded (P5) | Compare setup still creates sessions; no local LLM in compare module itself | **P18/P15:** UI classify; optional block `POST /compare/start` in Console Mode. |
| `routes/cookbook_routes.py` | Model download, serve, subprocess install | **Partial:** shell install guarded via shell_routes (P12). **Cookbook routes:** **unguarded** subprocess serve/install. | **High:** `subprocess` model serve/download from HTTP | **P19:** execution guard on cookbook install/serve/start endpoints. |
| `routes/model_routes.py` | Endpoint CRUD, probe, tools registry | **None** (intentional) | Admin can add endpoints; probes call external APIs | **preserve_for_ollama_or_local_model_status** — document as Claudia admin; optional read-only mode later. |
| `routes/shell_routes.py` | Shell exec/stream, cookbook install | **Guarded (P12)** | Read/cookbook non-install routes | Keep guards; audit any remaining exec paths. |
| `routes/mcp_routes.py` | MCP admin + connect | **Guarded (P12)** on add/reconnect/enable/oauth | List/status/read OK | Audit enable-toggle edge cases. |
| `routes/research_routes.py` | Deep research | **Guarded (P12)** on start | List/history/read | Audit resume if present. |
| `routes/email_routes.py` | IMAP/SMTP + AI assist | **Guarded (P11/P13)** writes + LLM assist | Pollers off at startup (P1); read/list OK | — |
| `routes/calendar_routes.py` | CalDAV + events | **Guarded (P11)** event create/update/delete | Read/sync/metadata OK | — |

**Additional surfaces (not in required row list but reviewed):**

| Surface | Guard status | Risk | Recommendation |
|---------|--------------|------|----------------|
| `routes/chat_routes.py` | Guarded → bridge (P5–P6) | Resume endpoint, attachments processing | Audit `chat_stream` resume + upload pipeline (P8b). |
| `routes/memory_routes.py` | Authority guarded (P13) | — | — |
| `routes/skills_routes.py` | Authority guarded (P13); `test` blocked at HTTP | Internal `stream_agent_loop` only after guard | — |
| `routes/upload_routes.py` | Vision/indexing guarded (P8b); bridge (P8) | — | — |
| `routes/personal_routes.py` | RAG upload indexing blocked | Personal doc writes may remain | P19 review. |
| `routes/claudia_routes.py` | Gateway forward-only | — | keep_active_claudia |
| `app.py` startup | Console Mode skips scheduler, pollers, bg_monitor, defaults, nightly audit | MCP connect + tool index warmup still run | P19: optional reduce startup side effects. |

---

## Matrix 2 — Legacy file/root clutter classification

| File/path | Current purpose | Claudia role | Classification | Recommendation |
|-----------|-----------------|--------------|----------------|----------------|
| `start-macos.sh` | Native macOS launcher | Primary Claudia Mac start path | **keep_active_claudia** | Keep; add comment pointer to private deployment doc (P18 optional). |
| `launch-windows.ps1` | Windows launcher | Legacy/non-Claudia-Mac dev | **keep_compatibility** | Do not remove until P18; document as non-primary. |
| `Dockerfile` | Container image build | Optional deployment | **keep_compatibility** | P18: label Claudia Console env vars in comments only. |
| `docker-compose.yml` | Multi-service stack | Optional deployment | **keep_compatibility** | P18: archive or `docker/README` Claudia notes. |
| `docker/` | Entrypoint, GPU overrides | Optional deployment | **keep_compatibility** | Same |
| `setup.py` | Packaging metadata | Legacy install | **keep_compatibility** | keep_optional_reference |
| `pyproject.toml` | Project metadata | Build/test | **keep_compatibility** | — |
| `build-macos-app.sh` | macOS app bundle | Optional | **keep_compatibility** | needs_review for Claudia branding |
| `install-service.sh` | systemd install | Linux server deploy | **archive_candidate** | P18: move to `scripts/legacy/` or document unused on Claudia Mac. |
| `odysseus-ui.service` | systemd unit | Linux server deploy | **archive_candidate** | Same |
| `scripts/` | `odysseus-*` CLI utilities | Operator/maintenance | **keep_optional_reference** | P18: classify each script; archive unused. |
| `scripts/odysseus` | Main CLI entry | Legacy operator | **keep_optional_reference** | Rename display only in docs, not binary (P18+). |
| `companion/` | LAN mobile pairing API | Private mobile access | **keep_active_claudia** | Align docs with Tailscale/private LAN (P16). |
| `docs/` | Marketing GIFs, `index.html`, reform notes | Mixed | **keep_optional_reference** | P18: archive `docs/index.html` Odysseus marketing if redundant with `static/landing.html`. |
| `docs/claudia_console_reform/` | Reform packages | Active program docs | **keep_active_claudia** | — |
| `static/landing.html` | Marketing/ satire page | Served legacy page | **needs_review** | P18: satire still says Odysseus; hero says Claudia. |
| `README.md` | Upstream Odysseus README | Confusing hybrid branding | **needs_review** | P18: Claudia section + link to reform docs (no full rewrite required). |
| `SECURITY.md` | Security policy | Active | **keep_active_claudia** | Updated P16 |
| `THREAT_MODEL.md` | Threat model | Reference | **needs_review** | P18: Claudia-specific threat addendum |
| `data/` | Runtime DB, auth, uploads, vectors | Local state | **do_not_touch_yet** | Never commit; backup per P16; no audit of contents. |
| `mcp_servers/` | Built-in MCP server scripts | Tooling | **keep_compatibility** | Internal-only; agent path P19. |
| `package.json` / `package-lock.json` | Frontend tooling (playwright etc.) | Dev/test | **keep_compatibility** | — |
| `requirements*.txt` | Python deps | Active | **keep_active_claudia** | — |
| `ACKNOWLEDGMENTS.md`, `ROADMAP.md`, `LICENSE` | Project meta | Reference | **keep_optional_reference** | — |
| `.github/` | Templates | Reference | **keep_compatibility** | — |

---

## Matrix 3 — Served UI/static page classification

| Page/static asset | Served/reachable? | Visible brand/status | Claudia role | Recommendation |
|-------------------|-------------------|----------------------|--------------|----------------|
| `static/login.html` | Yes (`/login`) | Claudia (P14) | Console entry | **keep_active_claudia** |
| `static/index.html` | Yes (`/`) | Claudia Console title (P14) | Main app shell | **keep_active_claudia** |
| `static/landing.html` | Yes (`/static/landing.html`) | Mixed: Claudia hero, Odysseus satire/history | Marketing/legacy | **needs_review** — P18 copy pass or archive |
| `static/manifest.json` | Yes (PWA) | Claudia (P14) | PWA install | **keep_active_claudia** |
| `static/sw.js` | Yes | Comment/cache `odysseus-v326` | PWA offline shell | **needs_review** — bump cache name in P18 optional |
| `static/app.js` | Yes | Claudia + `startOdysseusApp` | Boot + Console Mode init | **keep_active_claudia** |
| `static/js/claudiaConsoleMode.js` | Yes | Claudia | UI gating (P15) | **keep_active_claudia** |
| `static/js/claudiaDashboard.js` | Yes | Claudia | Dashboard (P9/P16) | **keep_active_claudia** |
| `static/js/chat.js`, `chatStream.js` | Yes | Claudia UI | Chat (bridge when Console Mode) | **keep_active_claudia** |
| `static/js/cookbook.js` | Yes | Claudia tool | Cookbook UI visible | **needs_review** — P19 backend guards |
| `static/js/gallery.js` | Yes | Gallery tool | Image gen UI visible | **needs_review** — P19 guards |
| `static/js/compare.js` | Yes | Compare tool | Uses guarded chat_stream | **needs_review** |
| `static/js/memory.js`, `skills.js` | Yes | Browse OK; mutations hidden (P15) | Mixed | P19 injection audit |
| `static/js/research/panel.js` | Yes | Hidden entry (P15) | Research | Keep hidden + HTTP guard |
| `docs/index.html` | Yes (GitHub pages path) | Odysseus marketing | Duplicate landing | **archive_candidate** |
| `companion` pairing HTML | Yes (`/api/companion/*`) | Claudia routes title | Mobile pairing | **keep_active_claudia** — private LAN only |

---

## Internal identifiers intentionally retained

| Identifier | Where used | Migration stance | Recommendation |
|------------|------------|------------------|----------------|
| `odysseus_session` | Cookie/session name | **Retain indefinitely** | Breaking change for all clients; not worth migration unless major version. |
| `ody_` API token prefix | API tokens | **Retain indefinitely** | Same; document in operator guide. |
| `odysseus-theme` | localStorage theme key | **Retain indefinitely** | PWA/users lose theme if renamed. |
| `odysseus-last-user` | login.html localStorage | **Retain indefinitely** | Low value to change. |
| `X-Odysseus-*` headers | Internal HTTP conventions | **Later migration optional** | Only if coordinated with clients; low priority. |
| `startOdysseusApp` | `static/app.js` entry | **Retain indefinitely** | Large refactor for cosmetic rename. |
| `CACHE_NAME = 'odysseus-v326'` | `static/sw.js` | **Later migration optional** | Bump on P18 if cache invalidation needed. |
| Python modules (`src/*`, `routes/*`, `core/*`) | Imports everywhere | **Do not rename** | Claudia is product name; codebase names are compatibility. |
| DB table/model names (`ScheduledTask`, etc.) | SQLAlchemy | **Do not rename** | Requires migrations. |
| FastAPI title "Claudia Console" | `app.py` | User-visible only | Already Claudia (P14). |
| GitHub URLs in landing | `pewdiepie-archdaemon/odysseus` | **needs_review** | P18 docs only unless repo renamed. |
| Literary Odysseus preset | `presets.js` | **Intentional** | keep_compatibility |

---

## High-priority cleanup candidates

1. **HTTP task/assistant run** — `POST /api/tasks/{id}/run`, `POST /api/assistant/run/{task_id}` with no Console Mode guard (**P19**).
2. **Cookbook subprocess serve/install** — unguarded routes in `cookbook_routes.py` (**P19**).
3. **Gallery/image AI routes** — many generative endpoints without guards (**P19**).
4. **Document restore/archive** — writes without file guard (**P19**).
5. **Root README / landing satire** — hybrid Odysseus branding confuses operators (**P18**).
6. **`docs/index.html` vs `static/landing.html`** — duplicate marketing (**P18** archive).
7. **Linux systemd artifacts** — `install-service.sh`, `odysseus-ui.service` on Claudia Mac path (**P18** archive).
8. **`scripts/odysseus-*` CLI** — classify and archive unused (**P18**).

## High-priority keep/compatibility candidates

1. `start-macos.sh` — Claudia Mac primary launcher.
2. `routes/claudia_routes.py` + Claudia static dashboard/console mode JS.
3. `src/console_mode.py` + guard modules + `claudia_*` bridges.
4. `model_routes.py` + Ollama/cookbook **read/status** surfaces.
5. Auth/session/token identifiers (table above).
6. `companion/` for private mobile pairing (with P16 network posture).
7. Docker assets for non-Mac dev/deploy (compatibility, not deletion).

## High-priority remaining authority risks

| Risk | Severity | Mitigation package |
|------|----------|-------------------|
| Manual task run invokes `stream_agent_loop` in Console Mode | **Critical** | P19 HTTP guard |
| Cookbook model serve/install subprocess | **High** | P19 execution guard |
| Gallery/image AI model calls | **High** | P19 authority guard |
| `execute_tool_block` if agent loop entered | **High** | P19 entry guard |
| MCP startup `connect_all_enabled` | **Medium** | P19 startup policy |
| Document restore without guard | **Medium** | P19 file guard policy |
| Frontend-only hiding (cookbook/gallery/compare) | **Medium** | P15 follow-up + P19 backend |
| Tool index / memory injection in chat if bridge regresses | **Medium** | P19 audit |

---

## Recommended cleanup sequence

| Package | Focus |
|---------|--------|
| **Package 18 — Controlled legacy file cleanup and archive pass** | No behavior change to guards; move/archive `install-service.sh`, unused scripts, duplicate `docs/index.html`; README/THREAT_MODEL Claudia pointers; optional `sw.js` cache bump; do **not** delete Ollama/Docker/Windows yet without explicit operator sign-off. |
| **Package 19 — Final authority hardening pass** | HTTP guards: task run, assistant run, cookbook execution, gallery generative routes, document restore policy; optional `execute_tool_block` / `stream_agent_loop` Console Mode entry guards; MCP startup policy. |
| **Package 20 — Final safety audit and operator handoff** | End-to-end test matrix, operator runbook, confirm P1–19, deployment checklist on Claudia Mac. |

---

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_final_audit_artifacts.py \
  tests/test_claudia_private_deployment_hardening.py \
  ... (P1–P16 Claudia tests)
```

## Results

- `python3 -m compileall -q app.py core routes src`: **pass**
- Focused Claudia tests (P1–P17): **165 passed**
- New Package 17 artifact tests: **17 passed**

## Known pytest baseline issue from Package 0

Collect-only may report 2 pre-existing errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

Not fixed in Package 17.

## Risks

- Audit is point-in-time; new routes without guards may be added later.
- Classification does not replace penetration testing on a deployed Claudia Mac.
- `data/` not inspected for sensitive contents.

## Follow-ups

- Execute P18 archive pass only after operator review of `legacy_file_classification.json`.
- P19 must address task run and cookbook/gallery before declaring Console Mode authority-safe.

## Next recommended package

**Package 18 — Controlled legacy file cleanup and archive pass**
