# Package 13 — Memory, skills, and model-routing demotion

| Field | Value |
|-------|-------|
| **Package** | Package 13 — Memory, skills, and model-routing demotion |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_12_shell_mcp_file_research_safety.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, demote Odysseus memory, skills, and model-routing authority so the Console cannot mutate canonical memory, change Tool Factory/skill authority, or run local LLM-assist/model work for Claudia decisions outside Claudia Core.

## Files changed

| File | Change |
|------|--------|
| `src/authority_console_guard.py` | **New** — `block_authority()`, `authority_disabled()`, `authority_disabled_sse()` |
| `routes/memory_routes.py` | Guards on add, extract, audit, import, pin, update, delete |
| `routes/skills_routes.py` | Guards on add, update, delete, test, audit-all, markdown save, builtin overrides |
| `routes/email_routes.py` | Guards on extract-style, summarize, ai-reply |
| `routes/document_routes.py` | Guards on ai-tidy, ai-fill-annotations; import-pdf via file write guard |
| `tests/test_claudia_authority_demotion.py` | **New** |
| `docs/claudia_console_reform/package_13_memory_skills_model_demotion.md` | **New** |

## Behavior changed

### Memory (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before mutation/LLM: `POST /add`, `POST /extract`, `POST /audit`, `POST /import`, `POST /{id}/pin`, `PUT /{id}`, `DELETE /{id}`.

Returns `status: authority_disabled`, `surface: memory`.

### Skills (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before mutation/execution: `POST /add`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/test`, `POST /audit-all`, `POST /{id}/markdown`, `PUT /builtin/{name}`, `DELETE /builtin/{name}`.

Returns `surface: skills`.

### LLM assist (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before model calls: `POST /api/email/extract-style`, `summarize`, `ai-reply`; `POST /api/documents/ai-tidy`; `POST /api/document/{id}/ai-fill-annotations`.

Returns `surface: llm_assist`.

### Documents (`CLAUDIA_CONSOLE_MODE=true`)

`POST /api/documents/import-pdf` blocked via Package 12 file guard (`import_pdf`).

### Legacy mode

Unchanged when `CLAUDIA_CONSOLE_MODE` is off.

## Behavior intentionally unchanged

- Packages 1–12 (gateway, chat bridge, execution guards, connector writes, etc.).
- Memory read: `GET /api/memory`, `POST /search`, `GET /timeline`, `GET /by-session/{id}`, `GET /{id}`, `POST /debug`.
- Skills read: list, index, builtin list/get, get skill, markdown read, test-status, audit-all/status, search.
- Model/provider admin: `model_routes` endpoints (list, CRUD endpoints, probe, test ping, disabled-tools settings).
- Ollama/cookbook modules and UI paths remain present.
- `agent_loop`, `llm_core`, in-process tool/memory injection not rewritten.

## Routes/surfaces reviewed

- `routes/memory_routes.py` — all `/api/memory/*`
- `routes/skills_routes.py` — all `/api/skills/*`
- `routes/email_routes.py` — LLM assist routes
- `routes/document_routes.py` — AI/tidy/import paths
- `routes/model_routes.py` — classified; admin/probe preserved
- `routes/cookbook_routes.py` — classified; Ollama admin preserved
- `routes/research_routes.py` — start guarded in P12

## Authority surface classification matrix

| Route or route pattern | Surface | Classification | Console Mode behavior | Local authority/execution in Console Mode? |
|------------------------|---------|----------------|------------------------|---------------------------------------------|
| `GET /api/memory` | memory | read/display | allowed | **No** |
| `POST /api/memory/search` | memory | read/search | allowed | **No** |
| `GET /api/memory/timeline`, `by-session`, `/{id}` | memory | read | allowed | **No** |
| `POST /api/memory/add` | memory | mutation | blocked (`add`) | **No** |
| `PUT /api/memory/{id}` | memory | mutation | blocked (`update`) | **No** |
| `DELETE /api/memory/{id}` | memory | mutation | blocked (`delete`) | **No** |
| `POST /api/memory/{id}/pin` | memory | mutation | blocked (`pin`) | **No** |
| `POST /api/memory/extract` | memory | LLM extraction | blocked (`extract`) | **No** |
| `POST /api/memory/audit` | memory | consolidate (LLM) | blocked (`audit`) | **No** |
| `POST /api/memory/import` | memory | import/extract (LLM) | blocked (`import`) | **No** |
| `GET /api/skills`, `/index`, `/builtin` | skills | read/catalog | allowed | **No** |
| `GET /api/skills/{id}`, `/{id}/markdown` | skills | read | allowed | **No** |
| `GET /api/skills/{id}/test-status`, `/audit-all/status` | skills | status | allowed | **No** |
| `POST /api/skills/add` | skills | mutation | blocked (`add`) | **No** |
| `PUT/DELETE /api/skills/{id}` | skills | mutation | blocked | **No** |
| `POST /api/skills/{id}/test` | skills | run/audit (agent+LLM) | blocked (`test`) | **No** |
| `POST /api/skills/audit-all` | skills | audit (agent+LLM) | blocked (`audit_all`) | **No** |
| `POST /api/skills/{id}/markdown` | skills | mutation | blocked (`save_markdown`) | **No** |
| `PUT/DELETE /api/skills/builtin/{name}` | skills | Tool Factory override | blocked | **No** |
| `POST /api/skills/search` | skills | read/search | allowed | **No** |
| `POST /api/email/extract-style` | llm_assist | model reasoning | blocked | **No** |
| `POST /api/email/summarize` | llm_assist | model reasoning | blocked | **No** |
| `POST /api/email/ai-reply` | llm_assist | model reasoning | blocked | **No** |
| `POST /api/documents/ai-tidy` | llm_assist | model + doc delete | blocked | **No** |
| `POST /api/document/{id}/ai-fill-annotations` | llm_assist | vision LLM | blocked | **No** |
| `POST /api/documents/import-pdf` | file | write (P12) | blocked (`import_pdf`) | **No** |
| `GET/POST /api/model-endpoints*` (list, probe, test) | model_routing | admin/status | allowed | **No** |
| `POST /api/settings/tools` (disabled list) | model_routing | admin metadata | allowed | **No** |
| Cookbook/Ollama routes | model_routing | admin/status | allowed* | **No** |
| `POST /api/research/start` | research | autonomous (P12) | blocked | **No** |
| Chat stream / agent_loop | model_routing | needs review | not guarded in P13 | legacy* |

\*Cookbook launch/install may still run in legacy paths; shell cookbook pip install blocked in P12.

## Memory, skills, and model surfaces preserved

### Memory

- **Preserved:** full list, search, timeline, per-session and per-id read, debug relevance (no writes).
- **Guarded:** add, update, delete, pin, extract, audit/consolidate, file import extraction.

### Skills

- **Preserved:** skill list, agent index, builtin catalog, skill detail, markdown source read, test/audit job status polling, skill search.
- **Guarded:** add/update/delete, skill test run, audit-all, markdown save, builtin instruction overrides.

### Model / Ollama

- **Preserved:** model endpoint CRUD, probe/test ping, Ollama URL detection in model routes, cookbook/Ollama admin modules and static UI integration (not removed).
- **Guarded:** email/document LLM-assist routes that performed local reasoning for user-facing outputs.

Display/config/status does not assert canonical Claudia memory or route models for autonomous work; guarded routes did.

## Console Mode blocked response behavior

```json
{
  "ok": false,
  "success": false,
  "status": "authority_disabled",
  "claudia_console_mode": true,
  "surface": "memory|skills|model_routing|llm_assist",
  "operation": "...",
  "message": "Claudia Console Mode is active. This authority is owned by Claudia Core. Route this request through Claudia Core governance.",
  "guidance": "..."
}
```

SSE helper `authority_disabled_sse()` available for future streaming routes.

## Memory authority guarded

add, update, delete, pin, extract, audit (consolidate), import.

## Skills/Tool Factory authority guarded

add, update, delete, test, audit-all, save markdown, builtin override set/reset.

## Model-routing/LLM-assist authority guarded

Email extract-style, summarize, ai-reply; document ai-tidy, ai-fill-annotations.

## Ollama/local model preservation status

**Preserved.** No removal of Ollama support, model endpoint admin routes, or cookbook integration. P13 only blocks LLM-assist and authority mutation paths in Console Mode.

## Safety guarantees

1. Guards only when `CLAUDIA_CONSOLE_MODE=true`.
2. Guards run before `memory_manager`/`skills_manager` mutation or `llm_call_async` on guarded routes.
3. Non-authoritative responses (do not claim Core executed work).
4. Legacy mode unchanged when flag is off.

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_authority_demotion.py \
  tests/test_claudia_execution_surface_guards.py \
  ... (P1–P12 Claudia tests)
```

## Results

- `compileall`: pass
- Focused Claudia package tests (P1–P13): **123 passed**
- New P13 tests: **8 passed**

## Known pytest baseline issue from Package 0

Collect-only may still report 2 pre-existing errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- `agent_loop`, chat stream, task scheduler, and memory injection in prompts still use local memory/skills/models outside HTTP guards.
- Document restore/tidy (non-AI), prepare-signed-reply, and other model routes not exhaustively guarded.
- Skills audit-all/cancel: cancel still allowed (stops job only).

## Follow-ups

- Demote in-process agent_loop memory/skill/model usage in Console Mode.
- Optional authority packets on blocked responses.
- Guard remaining document model routes if needed.
- Package 14: visible Claudia branding pass.

## Next recommended package

**Package 14 — Visible Claudia branding pass**
