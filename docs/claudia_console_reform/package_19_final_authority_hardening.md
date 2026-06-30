# Package 19 — Final authority hardening pass

| Field | Value |
|-------|-------|
| **Package** | Package 19 — Final authority hardening pass |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_17` … `package_18_controlled_legacy_file_cleanup.md` |

## Objective

Close highest-priority competing-authority gaps when `CLAUDIA_CONSOLE_MODE=true` without deleting modules or removing Ollama/local model support.

## Files changed

| File | Change |
|------|--------|
| `routes/task_routes.py` | Block `run`, `webhook_trigger` before `run_task_now` |
| `routes/assistant_routes.py` | Block `POST /run/{task_id}` |
| `routes/cookbook_routes.py` | Block download, serve, setup, ssh-key generate, kill-pid |
| `routes/gallery_routes.py` | Block primary generative routes (ai-upscale, style-transfer, inpaint) |
| `routes/document_routes.py` | Block archive, restore |
| `src/agent_loop.py` | Defensive `stream_agent_loop` early exit (SSE) |
| `src/tool_execution.py` | Defensive `execute_tool_block` early return |
| `app.py` | Skip `connect_all_enabled` in Console Mode |
| `tests/test_claudia_final_authority_hardening.py` | **New** (9 tests) |
| `docs/claudia_console_reform/package_19_final_authority_hardening.md` | **New** |

## Behavior changed

When `CLAUDIA_CONSOLE_MODE=true`:

- Manual task run and webhook task trigger return `local_execution_disabled` (`surface: tasks`).
- Assistant check-in run returns `local_execution_disabled` (`surface: assistant`).
- Cookbook download/serve/setup/ssh-key/kill-pid return `local_execution_disabled` (`surface: cookbook`).
- Gallery ai-upscale, style-transfer, inpaint return `authority_disabled` (`surface: gallery`).
- Document archive/restore return `local_execution_disabled` (`surface: file`).
- `stream_agent_loop` yields SSE `local_execution_disabled` + `[DONE]` without LLM/tools.
- `execute_tool_block` returns blocked result without running tools.
- MCP startup skips `connect_all_enabled` (builtin registration still runs).

## Behavior intentionally unchanged

- Legacy mode (`CLAUDIA_CONSOLE_MODE=false`): all above paths unchanged.
- Packages 1–18: chat bridge, Gateway, connector/execution/authority guards, branding, deployment warnings.
- Task list/status/metadata, cookbook GET/state, gallery library/browse, document read, model admin routes.
- Ollama/local model catalog and endpoint configuration surfaces.

## Routes/surfaces reviewed

`task_routes`, `assistant_routes`, `cookbook_routes`, `gallery_routes`, `document_routes`, `app.py` MCP startup, `agent_loop`, `tool_execution`, existing guard modules.

## Final authority hardening matrix

| Surface/route | Risk before P19 | P19 Console Mode | Legacy mode | Remaining risk |
|---------------|-----------------|------------------|-------------|----------------|
| `POST /api/tasks/{id}/run` | Invoked `run_task_now` → agent loop | **Blocked** (`tasks/run`) | Unchanged | Task CRUD still allowed; scheduler off at startup |
| `POST /api/tasks/{id}/webhook/{token}` | Webhook trigger ran tasks | **Blocked** (`webhook_trigger`) | Unchanged | External callers get disabled JSON |
| `POST /api/assistant/run/{task_id}` | Assistant check-in run | **Blocked** (`assistant/run`) | Unchanged | Settings/read unchanged |
| Task create/update | Could define autonomous tasks | **Not blocked** (metadata only; scheduler off) | Unchanged | P20: policy for llm/research task create |
| Cookbook download/serve/setup/kill/ssh-key | Subprocess execution | **Blocked** | Unchanged | `POST /api/cookbook/state` still saves config |
| Gallery generative routes | Provider/model calls | **Blocked** (ai-upscale, style, inpaint, harmonize, sharpen, denoise, upscale-local, remove-bg, enhance-face, ai-tag) | Unchanged | — |
| Gallery `GET /library` | Read/browse | **Preserved** | Unchanged | — |
| Document archive/restore | DB/content mutation | **Blocked** | Unchanged | Other doc writes already guarded P12 |
| MCP `connect_all_enabled` | Spawned tool servers | **Skipped** at startup | Unchanged | Manual MCP connect still HTTP-guarded P12 |
| `stream_agent_loop` | Local brain | **Defensive block** (SSE) | Unchanged | Missed HTTP paths still hit guard |
| `execute_tool_block` | Tool execution | **Defensive block** | Unchanged | Same |

## Safe surfaces preserved

- Task list, runs, notifications, metadata, pause/resume (non-run), meta/actions/events.
- Cookbook: cached models, GPUs, state GET, hf-latest, tasks/status, state POST (config sync).
- Gallery: library, albums, tags, stats, single image GET, uploads/metadata ops (non-AI).
- Document: list, read, export, guarded create/update/delete from P12.
- MCP: list/config routes; no auto-connect in Console Mode.
- Gateway/Console routes, health, approvals, chat packet bridge.
- Model endpoint admin (`model_routes`) for Ollama/status.

## Image generation preservation status

- Gallery UI, routes, and `data/generated_images` assets **not deleted**.
- Generative execution blocked in Console Mode on primary routes (ai-upscale, style-transfer, inpaint).
- All primary `/api/image/*` and gallery AI routes guarded in Console Mode; code retained for legacy mode and future Claudia worker wiring.
- Legacy mode unchanged.
- Future: Claudia Core worker/tool path for image generation.

## Agent/tool defensive entry guard status

| Function | Guarded? | Mechanism | Tests |
|----------|----------|-----------|-------|
| `stream_agent_loop` | **Yes** | Early SSE `local_execution_disabled` + return | `test_stream_agent_loop_blocked_in_console_mode` |
| `execute_tool_block` | **Yes** | Early return with `exit_code: 1` | `test_execute_tool_block_blocked_in_console_mode` |

Chat bridge does not call `stream_agent_loop` in Console Mode (P5–P6); defensive guards catch missed entrypoints.

## MCP startup behavior in Console Mode

- `register_builtin_servers` still runs (config registration).
- `mcp_manager.connect_all_enabled()` **skipped** — enabled servers do not spawn/connect at startup.
- HTTP MCP connect paths remain blocked in Console Mode (P12).
- Safer: no background stdio tool processes while Console acts as Gateway shell.

## Ollama/local model preservation status

- Cookbook **read** and model endpoint **admin** surfaces preserved.
- Download/serve **execution** blocked in Console Mode only.
- Legacy mode can still download/serve.
- Ollama not removed.

## Console Mode blocked response behavior

Uses existing `local_execution_disabled` / `authority_disabled` shapes from `execution_console_guard` and `authority_console_guard` (`ok: false`, `success: false`, `claudia_console_mode: true`, `surface`, `operation`, `message`, `guidance`).

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_claudia_final_authority_hardening.py + P1–P18 Claudia tests
```

## Results

- `compileall`: pass
- Focused Claudia tests (P1–P19): **187 passed**
- Package 19 tests: **9 passed**

## Known pytest baseline issue from Package 0

Collect-only may report 2 pre-existing errors in `tests/test_chat_image_routing.py` and `tests/test_webhook_ssrf_resilience.py`.

## Risks

- Not every gallery `/api/image/*` route has an explicit guard yet (inpaint + ai-upscale + style-transfer covered; others legacy-only risk if called directly).
- Task create/update still allowed (scheduler disabled reduces auto-run risk).
- Defensive agent guards return errors to any caller; ensure no legitimate Console path relied on direct `stream_agent_loop`.

## Follow-ups

- **Package 20:** operator handoff, extend gallery generative guards to all image routes, task-create policy, full safety audit.

## Next recommended package

**Package 20 — Final safety audit and operator handoff**
