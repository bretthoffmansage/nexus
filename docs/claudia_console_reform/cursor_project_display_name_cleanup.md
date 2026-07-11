# Package 20B — Cursor / project display-name metadata cleanup

| Field | Value |
|-------|-------|
| **Package** | Package 20B — Cursor/project display-name metadata cleanup |
| **Date/time** | 2026-06-03 |
| **Repo path** | `/Users/bretthoffman/Documents/console` |
| **Prior notes** | `package_20a_folder_rename_compatibility.md`, `console_path_api_connectivity_verification.md` |

## Objective

Find and safely update project/editor-facing metadata so the repository appears as **legacy local console** / `console` where appropriate, without renaming runtime compatibility identifiers or breaking existing behavior.

The macOS folder is already `console`. Cursor may still show “odysseus” from cached workspace metadata or from display fields in repo files.

## Files changed

| File | Change |
|------|--------|
| `README.md` | H1 → `# legacy local console`; banner → `legacy local console vers. 1.0`; hero alt text updated; “formerly Odysseus” in intro |
| `pyproject.toml` | Added `[project] name = "nexus-console"` and description |
| `package.json` | Added `name`, `description`; upstream `repository.url` unchanged |
| `package-lock.json` | Root `name` → `nexus-console` |
| `setup.py` | Docstring and setup banner → legacy local console (env vars unchanged) |
| `CONTRIBUTING.md` | Title → Contributing to legacy local console |
| `tests/test_readme_ascii_fenced.py` | Updated title/banner assertions |
| `tests/test_nexus_cursor_display_name_metadata.py` | **New** — display metadata static checks |
| `docs/console_reform/cursor_project_display_name_cleanup.md` | **New** — this note |

## Behavior changed

**Display/metadata only.** No runtime, Gateway, auth, or Console Mode behavior changes.

## Behavior intentionally unchanged

- `ODYSSEUS_*` env vars, `odysseus_session`, `odysseus-theme`, `X-Odysseus-*` headers
- `ody_` API token prefix, Python import paths, DB tables, Chroma collections
- Docker Compose service name `odysseus`, container user `odysseus`
- `scripts/odysseus-*` CLI entry points
- Git remote URL (`origin` → `pewdiepie-archdaemon/odysseus.git`)
- PWA `manifest.json` already named “Nexus”; `app.py` FastAPI title already “legacy local console”
- Historical package notes and bridge docs

## Cursor display-name finding summary

| Source | Finding |
|--------|---------|
| **Folder name** | Already `console` on disk |
| **`.code-workspace`** | Not present in repo |
| **`.vscode/`** | Not present in repo |
| **`.cursor/` in repo** | Not present |
| **`pyproject.toml`** | Had pytest config only; no project name → **added `nexus-console`** |
| **`package.json` / lock** | No `name` field; lock had `odysseus-ui` → **updated to `nexus-console`** |
| **`README.md` H1** | Was `# Odysseus` → **updated** |
| **`setup.py` banner** | Was “Odysseus Setup” → **updated** |
| **`app.py` / `manifest.json`** | Already Nexus-branded |
| **Git remote** | Still `odysseus.git` (upstream identity) — **not changed** |
| **Cursor cache** | May retain old workspace label until operator reopens folder (see manual steps) |

## Odysseus reference classification matrix

| Reference/location | Classification | Action | Notes |
|--------------------|----------------|--------|-------|
| `pyproject.toml` `[project].name` | safe_display_metadata_to_update | **Updated** → `nexus-console` | No import path impact |
| `setup.py` docstring/banner | safe_display_metadata_to_update | **Updated** | `ODYSSEUS_*` env vars retained |
| `package.json` `name` | safe_display_metadata_to_update | **Updated** → `nexus-console` | |
| `package-lock.json` root `name` | safe_display_metadata_to_update | **Updated** → `nexus-console` | |
| `package.json` `repository.url` | upstream_repo_reference_do_not_touch | **No change** | GitHub still `odysseus` |
| `README.md` H1 / banner | safe_display_metadata_to_update | **Updated** | Body still mentions Odysseus where historical |
| `README.md` clone URLs | upstream_repo_reference_do_not_touch | **No change** | `git clone …/odysseus.git` |
| `.git/config` remote | upstream_repo_reference_do_not_touch | **Read-only; no change** | Not local folder display name |
| `.code-workspace` / `.vscode` | N/A | **Not present** | |
| `ODYSSEUS_*` env vars | compatibility_identifier_do_not_touch | **No change** | Used across app/launchers |
| `odysseus_session` | compatibility_identifier_do_not_touch | **No change** | Cookie name |
| `odysseus-theme` | compatibility_identifier_do_not_touch | **No change** | localStorage key |
| `ody_` token prefix | compatibility_identifier_do_not_touch | **No change** | API tokens |
| `scripts/odysseus-*` | compatibility_identifier_do_not_touch | **No change** | CLI compatibility |
| Docker service `odysseus` | compatibility_identifier_do_not_touch | **No change** | Compose service name |
| `app.py` `X-Odysseus-*` | compatibility_identifier_do_not_touch | **No change** | HTTP headers |
| Historical package notes | historical_reference_do_not_touch | **No change** | Implementation record |
| `static/manifest.json` | safe_display_metadata (already correct) | **No change** | Already “Nexus” |

## Safe metadata changed

- README primary title and ASCII banner version line
- `pyproject.toml` project name and description
- `package.json` / `package-lock.json` npm package name
- `setup.py` operator-facing setup banner
- `CONTRIBUTING.md` title

## Compatibility identifiers intentionally retained

- Session/cookie: `odysseus_session`, `odysseus-theme`, `odysseus-last-user`
- Env: `ODYSSEUS_PORT`, `ODYSSEUS_HOST`, `ODYSSEUS_ADMIN_*`, `ODYSSEUS_INPROCESS_*`
- Headers: `X-Odysseus-Internal-Token`, `X-Odysseus-Owner`
- Tokens: `ody_` prefix
- Scripts: `scripts/odysseus-*`
- Docker: service/container user `odysseus`
- DB tables, Python modules, Chroma collection names

## Historical/upstream references intentionally retained

- Git remote: `https://github.com/pewdiepie-archdaemon/odysseus.git`
- README Docker/native clone instructions (`cd odysseus` after clone)
- README body references to Odysseus product/features
- Reform package notes `package_00`–`package_20` and bridge notes
- Image asset `docs/odysseus.jpg` filename

## Manual Cursor refresh steps

Cursor may cache the old workspace display name even after metadata updates.

1. **Close** the current workspace in Cursor (`File` → `Close Folder` / close window).
2. **Reopen** via `File` → `Open Folder…` → select `/Users/bretthoffman/Documents/console`.
3. If the sidebar or window title still shows “odysseus”, remove the stale entry from **File → Open Recent** and open the folder again by full path.
4. Optional: in Cursor’s recent-projects list, clear or avoid the old `odysseus` / nested `nexus/console` entry if present.
5. **Do not** delete Cursor application caches unless steps 1–4 fail — usually unnecessary.

The **git remote name** (`odysseus.git`) does not control Cursor’s local folder label; the **opened folder path** and **cached recent workspace** do.

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_nexus_cursor_display_name_metadata.py \
  tests/test_console_path_api_connectivity.py \
  tests/test_nexus_folder_rename_compatibility.py \
  tests/test_nexus_final_safety_audit.py \
  tests/test_nexus_final_authority_hardening.py \
  tests/test_console_mode.py \
  tests/test_readme_ascii_fenced.py
```

Inspection:

```bash
git remote -v
find . -maxdepth 3 \( -name "*.code-workspace" -o -path "./.vscode/*" \) -print
```

## Results

| Check | Result |
|-------|--------|
| Safe display metadata updated | **Pass** |
| Compatibility identifiers untouched | **Pass** |
| No `.code-workspace` / `.vscode` in repo | **Confirmed** |
| `bash -n start-macos.sh` | **Pass** |
| `python3 -m compileall` | **Pass** (see pytest output) |
| Focused pytest (7 files, incl. display metadata) | **Pass** — 113 tests |

## Risks

- Cursor may still show “odysseus” until the operator reopens the folder (cache/recent projects).
- Upstream GitHub repo name remains `odysseus`; clone docs still say `cd odysseus` while local checkout is `console`.
- Full README body is still Odysseus-oriented in places; only the top-level display title/banner were updated in this pass.

## Recommended next pass

**Core endpoint completion + bounded live E2E acceptance** — implement remaining Nexus Core contract endpoints and run two-terminal smoke tests against live Core at `http://127.0.0.1:8080`.
