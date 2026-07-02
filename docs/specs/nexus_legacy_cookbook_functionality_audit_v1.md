# Nexus Legacy Cookbook Functionality Audit (v1)

**Package:** `nexus_legacy_cookbook_functionality_audit_v1`  
**Date:** 2026-07-02  
**Repository:** `claudia_console`  
**Scope:** Read-only audit — no implementation

## Executive summary

**Cookbook is not a prompt library, workflow catalog, or food-recipe feature.** In Odysseus / the Claudia local console it is a **local LLM operations console**: hardware fit scoring (llmfit / hwfit), Hugging Face model download, vLLM / llama.cpp / Ollama / diffusers **serve** management, saved **serve presets** (internally called “recipes”), remote SSH GPU servers, dependency installation, and tmux-backed background tasks. It is **admin-gated**, **executable**, and **local-only** (`legacy_local_console/routes/cookbook_routes.py`, `data/cookbook_state.json`).

Hosted Nexus exposes `/knowledge` labeled **Cookbook** with misleading subtitle *“Recipe library and serve workflows”* — a pun on serve presets, not Nexus product recipes. The page is a **dead legacy UI shell** (`KnowledgeWorkspace.tsx`): one disabled button, no adapter, no Convex schema, no API routes. The `local_only` sidebar badge is **accurate**.

**Classification:** placeholder over a missing hosted backend; legacy backend **still exists** under `legacy_local_console/` but is **unreachable** from hosted Nexus.

**Recommendation:** Do **not** revive Cookbook on hosted Nexus. **Hide or remove** the sidebar entry and route (Option F). Keep full Cookbook on the Claudia Mac legacy console for operators who run local models. Do not repurpose this page as Chat/Tasks/Calendar templates without renaming — the name and legacy code unambiguously mean local model infrastructure.

---

## Current Nexus surface

| Item | Location |
|------|----------|
| Route | `app/knowledge/page.tsx` → **`/knowledge`** (sidebar label: **Cookbook**) |
| Component | `components/workspace/port/KnowledgeWorkspace.tsx` |
| Adapter | **None** (`lib/adapters/` has no cookbook/knowledge adapter) |
| Convex | **No** cookbook tables or functions |
| Navigation | `lib/navigation/toolRegistry.ts` — `id: "knowledge"`, `availability: "local_only"` |
| Introduced | `329270d` — *Port legacy workspace tools into Nexus* |

### Visible controls (hosted) — audit

| Control | File | Handler | Status | Original legacy intent |
|---------|------|---------|--------|------------------------|
| Availability banner | `KnowledgeWorkspace.tsx` | `ToolAvailabilityBanner` `local_only` | Always shown | Correct: local Claudia console only |
| Title | `KnowledgeWorkspace.tsx` | — | Static **Cookbook** | Same |
| Subtitle | `KnowledgeWorkspace.tsx` | — | *Recipe library and serve workflows* | Misleading on hosted; meant serve **presets** |
| Body copy | `KnowledgeWorkspace.tsx` | — | Points to legacy console | Accurate deferral |
| **Browse recipes** button | `KnowledgeWorkspace.tsx` | None | **`disabled`** | Would open Cookbook modal / preset browser locally |

No search, categories, tabs, editor, run, import/export, or data queries exist on hosted Nexus.

---

## Original intended purpose (legacy)

**Local model lifecycle management** for Claudia / Odysseus operators.

Source evidence:

- `legacy_local_console/README_LEGACY_CONSOLE.md`: *“Cookbook — Scans your hardware, recommends models, click to download and serve”* (llmfit, VRAM-aware, GGUF/FP8/AWQ, vLLM/llama.cpp).
- `legacy_local_console/static/js/cookbook.js` header: *“What Fits? + Saved presets, inline action panels”*.
- `docs/specs/nexus_legacy_capability_migration_matrix_v1.md` Cookbook row: user intent **“Manage local models”**, disposition **D3** (legacy local retain).

### What it was **not**

- Food recipes
- Chat prompt snippets
- Nexus task templates
- Calendar schedules
- Vault Library documents
- Agent skill markdown repos (separate Brain → Skills tab in legacy)
- Hosted Connector workflows

### Cookbook UI tabs (legacy modal)

From `cookbook.js`, slash-command tour, and modules:

| Tab | Module | Purpose |
|-----|--------|---------|
| Download | `cookbookDownload.js`, `cookbook-hwfit.js` | HF repo search, hardware fit list, download commands |
| Serve | `cookbookServe.js` | Launch cached models (vLLM, llama.cpp, Ollama, etc.) |
| Running | `cookbookRunning.js` | tmux task monitor (downloads + serves) |
| Settings | `cookbook.js` | Servers, HF token, model paths, SSH |
| Dependencies | `cookbook.js` | Install/serve engine packages on local or remote host |

---

## Data authority and storage (legacy)

| Layer | Authority |
|-------|-----------|
| Primary persisted state | `data/cookbook_state.json` (via `DATA_DIR`) |
| Browser cache | `localStorage` keys `cookbook-presets`, `cookbook-last-state`, `cookbook-serve-state` |
| Sync | `GET/POST /api/cookbook/state` merges presets, tasks, env servers |
| Model files | `~/.cache/huggingface/hub` (or configured model dirs) |
| Execution | Local subprocess, **tmux** sessions, optional **SSH** to remote GPU hosts |

**Admin required:** `require_admin` on state and destructive routes (`cookbook_routes.py`).

**Console Mode / hosted guard:** `block_local_execution("cookbook", …)` — cookbook subprocesses blocked when Claudia runs in governed console mode.

---

## Data model (evidence-based)

### `cookbook_state.json` (server)

Documented in `cookbook_routes.py` `get/save_cookbook_state`:

- **`tasks`**: background download/serve jobs  
  - Fields observed in JS/routes: `sessionId`, `ts`, `type` (`download` \| `serve`), `name`, `remoteHost`, `payload` (e.g. `_cmd`, `repo_id`, `model`, `backend`)
- **`presets`**: saved serve configurations (synced from localStorage)  
  - Fields from `cookbookRunning.js`: `name`, `model`, `backend`, `host`, `port`, `cmd`, `remoteHost`, `label`, `confirmedWorking`, env-related fields
- **`env`**: operator environment  
  - `servers[]` (host, name, platform, ssh port, model dirs), `hfToken`, `gpus`, `modelPaths`, `defaultServer`, `platform`, etc.

### Serve preset (`cookbook-presets` localStorage)

Same shape as presets array above — **executable shell commands**, not text prompts.

### Hardware fit rows (`cookbook-hwfit.js`)

Model catalog entries with fit scoring against detected GPU/VRAM (llmfit integration) — reference + launch, not CRUD user documents.

---

## User actions (legacy)

| Action | Supported | Mechanism |
|--------|-----------|-----------|
| Create | Yes | New download task, new serve preset, add server |
| Edit | Yes | Preset/server settings, serve parameters |
| Delete | Yes | Cached model delete, preset remove, kill PID |
| Duplicate | Partial | Save serve config as preset; auto-save from running task |
| Categorize / tags | No (product sense) | HF repo tags in search UI only |
| Search | Yes | HF latest search, hwfit filter, cached model filter |
| Favorite | No | — |
| Import / export | Partial | State sync via `/api/cookbook/state`; SSH key generation |
| **Run / execute** | **Yes** | Download models, serve models, tmux background tasks |

---

## Execution model (legacy)

1. User picks model + backend + server (local or SSH).
2. UI builds shell command (`_buildServeCmd`, `_buildDownloadCmd`).
3. `POST /api/model/download` or `POST /api/model/serve` (and related routes) spawn **tmux** / subprocess on target host.
4. Tasks tracked in `cookbook_state.json` + polled via `/api/cookbook/tasks/status`.
5. Running serves register OpenAI-compatible endpoints (model picker listens for `ge:model-endpoints-updated`).
6. Agent tools in `tool_implementations.py` can list presets, serve models, stop serves — all call **local** `/api/cookbook/*`.

**Requires:** local Claudia Mac (or legacy server), admin role, tmux, often GPU; remote SSH optional.

**Not compatible with hosted Nexus queue:** execution is shell/subprocess, not `nexusTasks` / Connector tool IDs.

---

## Backend path (legacy)

| Endpoint (sample) | Role |
|-------------------|------|
| `GET/POST /api/cookbook/state` | Presets, tasks, env sync |
| `POST /api/model/download` | HF download job |
| `POST /api/model/serve` | Launch serve |
| `GET /api/model/cached` | List cached GGUF/safetensors |
| `GET /api/cookbook/gpus` | GPU detection |
| `GET /api/cookbook/tasks/status` | tmux task polling |
| `GET /api/cookbook/hf-latest` | HF search |
| `POST /api/cookbook/setup` | Dependency setup |
| `POST /api/cookbook/kill-pid` | Stop process |

Files: `legacy_local_console/routes/cookbook_routes.py`, `cookbook_helpers.py`, JS modules under `static/js/cookbook*.js`.

---

## Hosted Nexus support history

| Question | Answer |
|----------|--------|
| Ever had working hosted backend? | **No** — port inventory explicitly lists “Cookbook install/start/stop” as **not ported** (`nexus_p4_4_legacy_frontend_port_inventory_v1.md`) |
| Convex / Connector cookbook? | **No** — zero `cookbook` references in `convex/` |
| Usable backend today from Nexus? | **No** — only `legacy_local_console/` on Claudia Mac |

---

## Overlap with current Nexus

| Surface | Overlap with Cookbook |
|---------|----------------------|
| **Chat** | None — no local model serve |
| **Tasks** | None — `nexusTasks` is Connector governed tools, not tmux shell |
| **Calendar** | None |
| **Skills** | Low — Skills documents **approved Nexus tools**; legacy Brain Skills taught **agent procedures** (filesystem); neither is model download/serve |
| **Deep Research** | **Superficial** — DR has **read-only model picker** from Gateway catalog (`/api/deep-research/models`); Claudia owns execution. Cookbook **downloads and serves** local weights |
| **Notes** | None |
| **Vault Library** | None — documents vs binary model weights |
| **Settings / Status** | Status shows Connector/system health, not local GPU serve |
| **Claudia tools** | Legacy agent had cookbook HTTP tools; **no** `research.hermes_deep_research`-style cookbook tool in Nexus registry |

**Unique legacy value:** local operator control of GPU model inventory and OpenAI-compatible local endpoints. **Not unique on hosted Nexus** — hosted path uses Gateway/Claudia-managed models.

---

## Repurposing options (evaluation)

| Option | Fit with original | Overlap | Authority needed | Execution safety | Complexity | User benefit on hosted |
|--------|-------------------|---------|------------------|------------------|------------|------------------------|
| **A. Saved prompt library** | Poor (wrong metaphor) | Chat, DR request text | Convex CRUD | Safe | Medium | Medium — but rename required |
| **B. Task template library** | Poor | Calendar + Tasks patterns emerging | Convex templates | Medium | High | Medium |
| **C. Workflow/playbook library** | Poor | Vault Library docs | Library | Safe read | Medium | Low |
| **D. Calendar template library** | None | Calendar scheduling | Convex events | Medium | High | Low |
| **E. Skills recipes** | Poor | Skills catalog | Static catalog | Safe | Low | Low — already covered |
| **F. Remove / hide page** | N/A | None | None | N/A | **Low** | **High clarity** |

---

## Recommendation (no implementation)

1. **Future purpose:** None on hosted Nexus for the Cookbook name/surface.
2. **Authority:** Keep `cookbook_state.json` + local routes on Claudia Mac only (**D3**).
3. **Execution:** No hosted execution path; do not wire to `nexusTasks`.
4. **UI:** Remove sidebar entry and `/knowledge` route **or** replace with a short **“Local model operations”** doc link that points operators to legacy console — not an interactive tool.
5. **Do not** build Convex tables or Connector tools for cookbook without a full product redesign and rename.

**Next package (suggested):** `nexus_cookbook_sidebar_removal_or_local_ops_redirect_v1` — hide misleading hosted page, preserve legacy console unchanged.

---

## Reuse assessment

| Element | Verdict |
|---------|---------|
| Page layout / `cookbook-grid` CSS | Obsolete shell — minimal |
| “Browse recipes” button | Misleading — remove |
| Subtitle copy | Misleading on hosted — remove |
| `local_only` banner | **Accurate — reusable** if page kept as explainer |
| Route `/knowledge` | Misleading id vs label — remove or redirect |
| `toolRegistry` entry | Misleading availability for hosted product — hide |
| Legacy `cookbook.js` modules | **Reusable as-is** on local console only |
| `cookbook_routes.py` | **Alive** in legacy tree |

---

## Tests / specs / history

| Artifact | Finding |
|----------|---------|
| Nexus tests | **None** for Cookbook / `KnowledgeWorkspace` |
| Legacy tests | `legacy_local_console/tests/test_cookbook_*.py` — helpers, endpoints, packages |
| Specs | `nexus_p4_4_legacy_frontend_port_inventory_v1.md`, `nexus_legacy_capability_migration_matrix_v1.md` (D3) |
| Git (Nexus) | `329270d` introduced `KnowledgeWorkspace.tsx` as port shell |
| Git (legacy cookbook) | Active maintenance (e.g. download toast, NVFP4, Docker serve fixes) |

---

## Explicit answers

| Question | Answer |
|----------|--------|
| What was Cookbook for? | **Local LLM download, hardware fit, serve, and preset management** |
| Executable or reference only? | **Executable** (tmux/subprocess/SSH) |
| What did an item contain? | **Serve presets** (model id, backend, host, port, shell cmd) and **tasks** (download/serve jobs) — not prompts |
| Where stored? | **`cookbook_state.json`**, browser localStorage, HF cache on disk |
| Ever a working hosted backend? | **No** |
| Usable backend still exists? | **Yes**, in `legacy_local_console/` only |
| Hosted Nexus ever supported it? | **No** |
| Is Connector/local_only badge accurate? | **Yes** |
| Unique value alongside Chat/Tasks/…? | **No** on hosted Nexus |
| Revive, repurpose, merge, or remove? | **Remove or hide** on hosted; **retain locally** on Claudia Mac |
