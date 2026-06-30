# Operator scripts (`scripts/`)

Legacy and operator utilities for the Odysseus codebase (Claudia Console reform). These are **not** started automatically by `./start-macos.sh`.

Repository checkout (Claudia Mac):

```text
/Users/bretthoffman/Documents/claudia_console
```

- Review each script before use on a **Claudia Console** deployment (`CLAUDIA_CONSOLE_MODE=true`).
- Prefer Gateway/Claudia Core workflows for task, memory, and agent authority.
- CLI entry points are named `odysseus-*` for compatibility; renaming is deferred.

Primary app launchers:

| Platform | Script |
|----------|--------|
| macOS (Claudia Mac) | `../start-macos.sh` |
| Windows | `../launch-windows.ps1` |
| Docker | `../docker-compose.yml` |

Claudia Gateway bridge verification (Core + Console running):

```bash
# Core: cd /Users/bretthoffman/Documents/claudia_system && ./start-core-api.sh
# Console: cd /Users/bretthoffman/Documents/claudia_console && CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
./test_claudia_gateway_bridge.sh
```

Maps Console `GET /api/claudia/v1/packets` → Core `GET /tasks`. Simple Chat uses `POST /messages` (Bridge 05). CLI Mirror relay: `./test_claudia_cli_relay.sh` → `/api/claudia/v1/cli/sessions/*` (Bridge 08; Core needs `CLAUDIA_ENABLE_HERMES_PTY=true`). CLI Mirror UI: switch **Simple Chat | CLI Mirror** in Console Mode (Bridge 09–11). See `docs/claudia_console_reform/package_bridge_11_cli_mirror_session_resume_operator_controls.md`.

Embedded Hermes runtime (Claudia System — not `~/.hermes` or global PATH):

```bash
cd /Users/bretthoffman/Documents/claudia_system
HERMES_HOME="/Users/bretthoffman/Documents/claudia_system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes --help
HERMES_HOME="/Users/bretthoffman/Documents/claudia_system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes config
HERMES_HOME="/Users/bretthoffman/Documents/claudia_system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes doctor
```

Console Gateway reports embedded runtime status on `GET /api/claudia/v1/health` (`hermes_runtime` field). Resolver: `src/hermes_runtime.py`.

Archived Linux systemd installer: `docs/claudia_console_reform/legacy_archive/`.
