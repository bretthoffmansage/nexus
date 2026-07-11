# Package 1 — legacy local console Mode flags and autonomy startup kill switches

| Field | Value |
|-------|-------|
| **Package** | Package 1 — legacy local console Mode flags and autonomy startup kill switches |
| **Date/time** | 2026-06-02 (implementation pass) |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior baseline** | `docs/console_reform/package_00_baseline_repo_state.md` |

## Objective

Add `NEXUS_CONSOLE_MODE` so Odysseus can start as a UI/API shell without in-process autonomous background systems that would compete with Nexus Core. Startup-level gates only — no Gateway routes, chat demotion, or branding changes.

## Files changed

| File | Change |
|------|--------|
| `src/console_mode.py` | **New** — `is_console_mode()`, `inprocess_tasks_enabled()`, `inprocess_pollers_enabled()` |
| `app.py` | Guard `bg_monitor`, `ensure_defaults`, `task_scheduler.start()`, nightly skill audit; startup banner log |
| `routes/email_pollers.py` | Delegate `_inprocess_pollers_enabled()` to `src.console_mode`; console-mode log line |
| `.env.example` | Document `NEXUS_CONSOLE_MODE` and interaction with in-process flags |
| `tests/test_console_mode.py` | **New** — unit tests for env parsing and poller delegation |
| `docs/console_reform/package_01_console_mode_flags.md` | **New** — this note |

## Behavior changed

When `NEXUS_CONSOLE_MODE` is set to a truthy value (`1`, `true`, `yes`, `on`, case-insensitive):

1. **TaskScheduler runner** — `task_scheduler.start()` is not called (even if `ODYSSEUS_INPROCESS_TASKS=1`).
2. **Default task seeding** — `_ensure_default_tasks()` / `ensure_defaults` loop is skipped at startup.
3. **Email pollers** — `_start_poller()` returns immediately (even if `ODYSSEUS_INPROCESS_POLLERS=1`).
4. **bg_monitor** — `start_bg_monitor()` is not invoked (no background agent auto-continuation on `#!bg` jobs).
5. **Nightly skill audit** — `_skill_audit_nightly_loop` task is not scheduled (no autonomous `run_scheduled_skill_audit` at startup).

Startup logs use the `[nexus-console]` prefix for each skip.

When `NEXUS_CONSOLE_MODE` is unset or not truthy, behavior matches pre-Package-1 legacy defaults, subject to existing `ODYSSEUS_INPROCESS_TASKS` / `ODYSSEUS_INPROCESS_POLLERS` kill switches.

## Behavior intentionally unchanged

- HTTP serving, static UI, login, auth, all route registration
- Chat routing and `stream_agent_loop` (on-demand via API only)
- MCP startup connection, tool index warmup, endpoint warmup/keepalive
- Upload cleanup, null-owner sweep, skill owner backfill, incognito purge
- Ollama/local model support (Cookbook, `llm_core`, `/api/runtime` ollama URL)
- No `/api/nexus/v1/*` routes
- No Convex, Clerk, rebranding, or auth migration
- No deletion of `agent_loop`, `task_scheduler`, pollers, or `bg_monitor` modules

## legacy local console Mode startup behavior matrix

| System | Legacy / default (console mode off) | Existing kill switch | legacy local console Mode (`NEXUS_CONSOLE_MODE=true`) |
|--------|-------------------------------------|----------------------|--------------------------------------------------|
| **TaskScheduler runner** | Starts at startup (`ODYSSEUS_INPROCESS_TASKS` default on) | `ODYSSEUS_INPROCESS_TASKS=0` disables | **Not started** (overrides in-process flag) |
| **Default task seeding** (`ensure_defaults`) | Runs before scheduler start | N/A (tied to startup path) | **Skipped** |
| **Email pollers** | Start via `setup_email_routes` → `_start_poller()` | `ODYSSEUS_INPROCESS_POLLERS=0` disables | **Not started** (overrides in-process flag) |
| **bg_monitor** | Started at startup | None at env level | **Not started** |
| **Nightly skill audit loop** | Scheduled asyncio loop at startup | Per-user setting `skill_audit_nightly` at runtime only | **Not scheduled** at startup |
| **HTTP UI / API serving** | On | N/A | **On** |
| **Auth / login** | On | `AUTH_ENABLED`, etc. unchanged | **On** |
| **Ollama / local model support** | On (admin/settings/cookbook) | N/A | **On** (preserved) |

## Environment flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXUS_CONSOLE_MODE` | off (unset) | Master console shell mode; truthy values: `1`, `true`, `yes`, `on` |
| `ODYSSEUS_INPROCESS_TASKS` | `1` | Legacy: disable in-process task scheduler when `0`/`false`/`no`/`off` |
| `ODYSSEUS_INPROCESS_POLLERS` | `1` | Legacy: disable in-process email pollers when `0`/`false`/`no`/`off` |

**Precedence:** `NEXUS_CONSOLE_MODE=true` forces the safe (off) side for tasks and pollers regardless of `ODYSSEUS_INPROCESS_*=1`.

**Helper module:** `src/console_mode.py`

```python
is_console_mode()      # NEXUS_CONSOLE_MODE truthy
inprocess_tasks_enabled()      # not console mode AND ODYSSEUS_INPROCESS_TASKS on
inprocess_pollers_enabled()    # not console mode AND ODYSSEUS_INPROCESS_POLLERS on
```

## Tests / checks run

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| `venv/bin/python -m pytest -q tests/test_console_mode.py` | **Pass** (17 tests) |
| `venv/bin/python -m pytest -q tests/test_security_regressions.py::test_inprocess_pollers_gate` | **Pass** (legacy poller gate preserved) |
| Bounded env smoke (`NEXUS_CONSOLE_MODE=true` + in-process flags `1`) | **Pass** |
| Server start / live HTTP | **Not run** (avoid long-running process) |
| Full pytest suite | **Not run** |

### Known pytest baseline (Package 0)

`pytest --collect-only` still reports 2 pre-existing collection errors unrelated to this package:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

No new collection errors from Package 1 files.

## Risks

| Risk | Note |
|------|------|
| On-demand autonomy still available | Chat, tasks API, skills run, MCP, shell routes still callable — Package 2+ will demote route-level behavior |
| Manual task/email ops | Operators must use external drivers or Nexus Core when console mode is on |
| Env typo | Values like `NEXUS_CONSOLE_MODE=enabled` are treated as off (only explicit on-set is recognized) |
| Import-time poller hook | `setup_email_routes()` still calls `_start_poller()` at import; gate inside `_start_poller` prevents tasks |

## Follow-ups

1. Document `NEXUS_CONSOLE_MODE=true` in operator runbooks / `start-macos.sh` optional hook (later).
2. Package 2 — minimal Nexus Gateway bridge (`/api/nexus/v1/*` façade).
3. Later packages — route-level chat demotion, webhook/task firing policy, MCP policy under console mode.

## Next recommended package

**Package 2 — Minimal Nexus Gateway bridge**

Add the `/api/nexus/v1/*` namespace as a thin gateway layer toward Nexus Core without moving decision authority into Odysseus.

---

*End of Package 1 implementation note.*
