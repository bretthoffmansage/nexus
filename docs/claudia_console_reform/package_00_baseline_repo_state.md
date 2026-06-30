# Package 0 — Baseline repo preservation and current-state check

| Field | Value |
|-------|-------|
| **Package** | Package 0 — Baseline repo preservation and current-state check |
| **Date/time** | 2026-06-02 16:40:55 EDT (2026-06-02 20:40:55 UTC) |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Inspector** | Read-only baseline pass (no app behavior changes) |

## Reform context (reference only)

Odysseus is being repurposed toward **Claudia Console UI** and **Claudia Gateway API** (`/api/claudia/v1/*` target namespace). **Claudia Core** lives separately at `/Users/bretthoffman/Documents/claudia_system` and must remain the authority for task control, decisions, worker/model routing, tool factory, housekeeping, audits, workspace writes, connector governance, and final authority. This package does not implement any of that; it only records the pre-reform state.

## Install and launch

| Item | Value |
|------|-------|
| **Install mode** | Native (not Docker); macOS quick start via Homebrew + local venv |
| **Start command** | `cd ~/Documents/odysseus && ./start-macos.sh` |
| **Uvicorn invocation** (from script) | `python -m uvicorn app:app --host "$HOST" --port "$PORT"` |
| **Default bind** | `127.0.0.1` (`APP_BIND` / `ODYSSEUS_HOST`) |
| **Default app port** | `7860` (`APP_PORT` / `ODYSSEUS_PORT`) — chosen because macOS AirPlay often holds `7000` |
| **Local URL** | `http://127.0.0.1:7860` |
| **README / Docker default port** | `7000` (documented alternate; `.env` can override) |
| **Ollama default** | `http://127.0.0.1:11434/v1` (native); `http://host.docker.internal:11434/v1` in Docker (`/api/runtime`) |
| **Other ports referenced** | Model discovery scans `8000–8020`, LM Studio `1234`, Ollama `11434`; SECURITY.md also mentions SearXNG `8080`, ntfy `8091`, ChromaDB `8100` |
| **Server started this package** | No — no long-running server or external services were started |

## Known admin account

- **Email/username (admin):** `brett@poweredbysage.com`
- Verified: sole key in `data/auth.json` `users` map with `is_admin: true`
- **Password:** not recorded (not read or printed)

## Git state (pre-reform baseline)

| Item | Value |
|------|-------|
| **Branch** | `main` |
| **Full commit** | `35c40bce75e929399342d858aaff92d3da4a4bb3` |
| **Short commit** | `35c40bc` |
| **Latest commit message** | `Fall back from invalid settings stores (#1416)` |
| **Working tree before Package 0** | Clean — `git status --short` returned no modified or untracked paths |
| **Untracked files before Package 0** | None observed |

## Boot and test posture

### Documented test commands

- `python -m pytest` (see `CONTRIBUTING.md`)
- `pyproject.toml`: `[tool.pytest.ini_options]` → `testpaths = ["tests"]`, `asyncio_mode = auto`
- `tests/` contains ~180+ test modules plus `tests/bombadil-spec.ts` (Playwright-style spec)
- `setup.py` can verify core imports (`fastapi`, `uvicorn`, etc.)

### Checks run this package

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** (exit 0) |
| `venv/bin/python -m pytest --collect-only -q` | **Partial** — 1346 tests collected; **2 collection errors** (`tests/test_chat_image_routing.py`, `tests/test_webhook_ssrf_resilience.py` — `TypeError` in `core.database.__all__` / MagicMock interaction) |
| Live server smoke | **Skipped** (not required; avoids long-running process) |
| External API calls | **None** |

### Repo boot status (operator-reported)

- Repository reported as booting successfully via `./start-macos.sh` before reform; not re-verified with a live HTTP probe in this package.

## High-level architecture entrypoints

### FastAPI and primary startup

| Role | Path / detail |
|------|----------------|
| **FastAPI entrypoint** | `app.py` — `app = FastAPI(...)`, served by uvicorn as `app:app` |
| **Component wiring** | `src/app_initializer.py` — `initialize_managers()` called from `app.py` |
| **Constants / paths** | `core/constants.py` (`BASE_DIR`, `STATIC_DIR`, etc.) |
| **Auth** | `core/auth.py`, `AuthManager`; routes via `routes/auth_routes.py` |
| **Database** | `core/database.py` — SQLAlchemy session factory, models |
| **Route registration** | `app.py` — `app.include_router(...)` for all feature routers (~508–699) |

### Static UI

| Role | Path |
|------|------|
| **SPA shell** | `static/index.html` (served at `/` and tool deep-links) |
| **Login page** | `static/login.html` (route `GET /login` in `app.py`) |
| **Static assets** | `app.mount("/static", ...)` |

### Primary chat / agent API path

| Endpoint | Module |
|----------|--------|
| `POST /api/chat` | `routes/chat_routes.py` |
| `POST /api/chat_stream` | `routes/chat_routes.py` → `src.agent_loop.stream_agent_loop` |
| Related | `/api/chat/resume`, `/api/chat/stop`, `/api/chat/stream_status`, `/api/inject_context` |

### Startup / background systems (review in later packages)

Registered or started from `app.py` `@app.on_event("startup")` and related imports:

| System | Location | Notes |
|--------|----------|--------|
| **Background job monitor** | `src/bg_monitor.start_bg_monitor()` | Auto-continues agent when `#!bg` shell jobs finish |
| **MCP connections** | `src/mcp_manager.McpManager`, `src/builtin_mcp.register_builtin_servers` | Async startup task; `routes/mcp_routes.py` |
| **Tool index warmup** | `src/tool_index` | Pre-warms RAG tool index |
| **Endpoint warmup / keepalive** | `app.py` startup | Periodic httpx pings to discovered LLM endpoints |
| **Default scheduled tasks** | `task_scheduler.ensure_defaults()` | Per-user housekeeping builtins |
| **Task scheduler runner** | `src/task_scheduler.TaskScheduler.start()` | Gated by `ODYSSEUS_INPROCESS_TASKS` (default on) |
| **Null-owner sweep** | Hourly loop in `app.py` | Legacy owner assignment |
| **Nightly skill audit** | `routes/skills_routes.run_scheduled_skill_audit` | Uses agent path indirectly |
| **Email pollers** | `routes/email_pollers._start_poller()` | Called from `routes/email_routes.py` setup; gated by `ODYSSEUS_INPROCESS_POLLERS` |
| **Upload cleanup** | `routes/upload_routes` cleanup task | Async periodic |
| **Webhook manager** | `src/webhook_manager.WebhookManager` | Loop set on startup |

### Major route modules (API surface)

Under `routes/`: auth, upload, session, memory, skills, **chat**, research, history, search, preset, diagnostics, cleanup, personal, embedding, model, tts, stt, document, signature, gallery, editor_draft, **task**, **assistant**, calendar, **shell**, cookbook, hwfit, compare, prefs, backup, font, **mcp**, webhook, api_token, note, **email**, vault, contacts; plus `companion/routes.py`.

### MCP and tool servers

- `mcp_servers/` — e.g. `email_server.py`, `image_gen_server.py`, `memory_server.py`, `rag_server.py`
- In-process tool execution: `src/agent_tools.py`, `src/tool_implementations.py`

## Autonomy risk entrypoints (competing authority vs future Claudia Core)

These are **in-Odysseus** loops and executors that later packages should demote, gate, or proxy to Claudia Core — not modified in Package 0:

| Risk area | Entry | Why it matters |
|-----------|--------|----------------|
| **Agent loop** | `src/agent_loop.py` — `stream_agent_loop` | Core LLM + tool loop; canonical chat autonomy |
| **Chat HTTP** | `routes/chat_routes.py` | User-facing streaming chat |
| **Scheduled tasks** | `src/task_scheduler.py` → `_run_agent_loop` → `stream_agent_loop` | Cron-like automation; `ODYSSEUS_INPROCESS_TASKS` kill switch exists |
| **Builtin task actions** | `src/builtin_actions.py` | Housekeeping, email summarize hooks, memory consolidation, etc. |
| **Email pollers** | `routes/email_pollers.py` | IMAP/scheduled send loops; `ODYSSEUS_INPROCESS_POLLERS` kill switch exists |
| **Background monitor** | `src/bg_monitor.py` | Re-invokes agent on bg job completion |
| **Skills agent paths** | `routes/skills_routes.py` | Skill run + scheduled audit uses `stream_agent_loop` |
| **Teacher escalation** | `src/teacher_escalation.py` | Secondary model loop |
| **Shell execution** | `routes/shell_routes.py` | User/admin command execution |
| **MCP tool surface** | `src/mcp_manager.py`, `routes/mcp_routes.py`, `mcp_servers/*` | External tool/process authority |
| **AI interaction / UI control** | `src/ai_interaction.py` | Debates, pipelines, UI automation tools |
| **Webhooks** | `routes/webhook_routes.py` | External trigger → in-app handlers |
| **Research** | `routes/research_routes.py`, `src/deep_research.py` | Long-running research jobs |
| **Assistant routes** | `routes/assistant_routes.py` | Tied to `task_scheduler` |
| **Cookbook / local model serve** | `routes/cookbook_routes.py`, `static/js/cookbook*.js` | Local model lifecycle (Ollama/llama.cpp); admin capability, not Claudia Core |
| **App API tool** | Agent loop `app_api` / OpenAPI loopback | Generic internal API invocation from agent |

**Existing env kill switches (document only):**

- `ODYSSEUS_INPROCESS_TASKS` — disable in-process task scheduler (`app.py`)
- `ODYSSEUS_INPROCESS_POLLERS` — disable in-process email pollers (`routes/email_pollers.py`)

## Ollama / local model preservation note

Local model support is deeply integrated and should be **preserved as optional admin/local capability** when reforming, not as independent Claudia authority:

- Default Ollama URL: `127.0.0.1:11434` (`/v1` OpenAI-compatible and `/api` native paths)
- `src/llm_core.py`, `src/model_discovery.py`, `src/endpoint_resolver.py` — provider detection and port `11434` heuristics
- Cookbook UI/JS and routes manage download/serve/cache
- Extensive tests under `tests/test_*ollama*`, `tests/test_provider_*`, `tests/test_local_endpoint_*`
- **No changes** to Ollama integration in Package 0

## Files changed by this package

| File | Action |
|------|--------|
| `docs/claudia_console_reform/package_00_baseline_repo_state.md` | **Created** (this note) |
| `docs/claudia_console_reform/` | **Created** (parent directory) |

No application code, config, or data files were modified.

## Behavior changed

**None.** This package is read-only documentation plus safe local inspection commands.

## Behavior intentionally unchanged

- All FastAPI routes, startup hooks, schedulers, pollers, MCP, agent loop, auth, chat, email, shell, cookbook, and data on disk
- No Claudia Gateway routes (`/api/claudia/v1/*`)
- No `CLAUDIA_CONSOLE_MODE` or new kill switches (reserved for Package 1)
- No rebranding, Convex, Clerk, or auth changes

## Risks

| Risk | Severity | Note |
|------|----------|------|
| Baseline drift | Low | Any commit or local `data/` change after this note requires re-baseline |
| Pytest collection errors | Low | 2 tests fail at collect time in current tree; full suite not executed |
| Dual port documentation | Info | Operators may use `7860` (start-macos) vs `7000` (README/Docker); document clearly in Package 1+ |
| Autonomy surface area | High (future) | Many overlapping loops; Package 1+ must coordinate kill switches with Claudia Core boundary |
| Sensitive local data | Info | `data/` contains runtime DB/auth; not copied into this note |

## Follow-ups

1. **Package 1** — Introduce Claudia Console Mode flags and autonomy startup kill switches (extend/document `ODYSSEUS_INPROCESS_*` pattern).
2. Map each autonomy risk row to a gateway/console demotion strategy.
3. Optionally fix pytest collection errors unrelated to reform (out of scope unless requested).
4. Add `/api/claudia/v1/*` gateway façade in a later package (not Package 0/1).

## Next recommended package

**Package 1 — Claudia Console Mode flags and autonomy startup kill switches**

Introduce environment/feature flags (e.g. `CLAUDIA_CONSOLE_MODE`) that default safely for reform work: disable or no-op in-process task scheduler, email pollers, bg monitor, and other competing autonomy at startup when console-only mode is enabled — without yet moving decision authority to Claudia Core.

---

*End of Package 0 baseline note.*
