# Package 18 — Controlled legacy file cleanup and archive pass

| Field | Value |
|-------|-------|
| **Package** | Package 18 — Controlled legacy file cleanup and archive pass |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_17_competing_authority_legacy_file_audit.md`, `legacy_file_classification.json` |

## Objective

Controlled archive of low-risk legacy deployment/marketing clutter and Nexus-oriented doc/static pointers — **no** runtime authority changes.

## Files changed

| File | Change |
|------|--------|
| `docs/console_reform/legacy_archive/README.md` | **New** — archive index + restore instructions |
| `docs/console_reform/legacy_archive/install-service.sh` | **Moved** from root |
| `docs/console_reform/legacy_archive/odysseus-ui.service` | **Moved** from root |
| `docs/console_reform/legacy_archive/docs_index.html` | **Moved** from `docs/index.html` |
| `README.md` | legacy local console/Gateway top note; landing path fix |
| `THREAT_MODEL.md` | legacy local console/Gateway addendum |
| `static/landing.html` | Legacy/satire banner |
| `static/sw.js` | Cache name `nexus-console-v1` |
| `start-macos.sh` | Nexus Mac primary path comment |
| `launch-windows.ps1` | Compatibility comment |
| `Dockerfile`, `docker-compose.yml` | Compatibility comments |
| `docker/README.md`, `scripts/README.md` | **New** operator notes |
| `docs/console_reform/legacy_file_classification.json` | Archived status |
| `tests/test_nexus_legacy_cleanup_archive.py` | **New** |
| `docs/console_reform/package_18_controlled_legacy_file_cleanup.md` | **New** — this note |

## Behavior changed

- **PWA:** Service worker cache name changed from `odysseus-v326` to `nexus-console-v1` (clients refresh precache on next SW activate).
- **Static:** `static/landing.html` shows a one-line legacy/satire notice.
- **Docs only:** README/THREAT_MODEL/deployment comments — no API/runtime logic changes.

## Behavior intentionally unchanged

Packages 1–17: Console Mode, Gateway, guards, chat bridge, branding (except landing banner), deployment health warnings, auth, Ollama, `data/`, internal identifiers, agent/task/cookbook/gallery authority (deferred to P19).

## Package 17 classification used

Source: `package_17_competing_authority_legacy_file_audit.md` and `legacy_file_classification.json`.

## Matrix 1 — Archive/move

| Original path | New path | Reason | Restore note |
|---------------|----------|--------|--------------|
| `install-service.sh` | `docs/console_reform/legacy_archive/install-service.sh` | Linux systemd installer; not Nexus Mac primary | Copy to repo root; edit service paths |
| `odysseus-ui.service` | `docs/console_reform/legacy_archive/odysseus-ui.service` | Paired systemd unit | Copy with install script |
| `docs/index.html` | `docs/console_reform/legacy_archive/docs_index.html` | Duplicate Odysseus marketing vs `static/landing.html` | `cp` to `docs/index.html` if GitHub Pages needs it |

## Matrix 2 — Keep/compatibility

| File/path | Classification | Reason kept | Future review? |
|-----------|----------------|-------------|----------------|
| `start-macos.sh` | keep_active_nexus | Primary Nexus Mac launcher | Optional plist/LaunchAgent doc |
| `launch-windows.ps1` | keep_compatibility | Windows dev/home lab | P20 operator handoff |
| `Dockerfile` | keep_compatibility | Container builds | — |
| `docker-compose.yml` | keep_compatibility | Reference stack | — |
| `docker/` | keep_compatibility | entrypoint, GPU overrides | — |
| `setup.py` | keep_compatibility | Packaging metadata | — |
| `scripts/` | keep_compatibility | Operator CLI utilities | Per-script audit later |
| `companion/` | keep_active_nexus | Private mobile pairing | P16 network posture |
| `data/` | do_not_touch_yet | Runtime user state | Never commit |

## Matrix 3 — Docs/static cleanup

| File/path | Cleanup performed | Behavior impact | Follow-up |
|-----------|-------------------|-----------------|-----------|
| `README.md` | legacy local console/Gateway note; `static/landing.html` link | None (docs) | Optional full README rebrand |
| `THREAT_MODEL.md` | Nexus addendum + private deployment link | None (docs) | Align role table with Console Mode in P20 |
| `static/landing.html` | Satire/legacy banner + link to Console | Visual only | Optional satire copy edit |
| `static/sw.js` | Cache `nexus-console-v1`; comment | PWA cache refresh once | — |
| `docs/index.html` | Archived as `docs_index.html` | None if unused at runtime | Restore only for GitHub Pages |

## Files intentionally not moved

- `Dockerfile`, `docker-compose.yml`, `docker/` (comments only)
- `launch-windows.ps1` (comment only)
- `setup.py`, `pyproject.toml`, `package.json`
- `scripts/*` (README only)
- `companion/`
- `data/`
- All `routes/`, `src/`, `static/index.html`, `static/login.html`, Gateway modules

## Root clutter status after cleanup

- Root no longer contains systemd install artifacts.
- Duplicate `docs/index.html` removed from active tree (archived).
- Primary launch path clarified: `start-macos.sh`.
- Docker/Windows/scripts documented as compatibility/reference.

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_nexus_legacy_cleanup_archive.py \
  tests/test_nexus_final_audit_artifacts.py \
  ... (P1–P17 Nexus tests)
```

## Results

- `python3 -m compileall -q app.py core routes src`: **pass**
- Focused Nexus tests (P1–P18): **178 passed** (9 new P18 archive tests)

## Known pytest baseline issue from Package 0

Collect-only may report 2 pre-existing errors in `tests/test_chat_image_routing.py` and `tests/test_webhook_ssrf_resilience.py`.

## Risks

- PWA users get a one-time cache refresh after SW update.
- Operators who relied on root `install-service.sh` must use archive copy.
- GitHub Pages may have linked `docs/index.html` externally — restore from archive if needed.

## Follow-ups

- **Package 19:** task/assistant run, cookbook subprocess, gallery AI, agent/tool entry guards.
- **Package 20:** operator handoff and final safety audit.

## Next recommended package

**Package 19 — Final authority hardening pass**
