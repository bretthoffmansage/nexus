# Operator scripts (`scripts/`)

Legacy and operator utilities for the Odysseus codebase (legacy local console reform). These are **not** started automatically by `./start-macos.sh`.

Repository checkout (Nexus Mac):

```text
/Users/bretthoffman/Documents/console
```

- Review each script before use on a **legacy local console** deployment (`NEXUS_CONSOLE_MODE=true`).
- Prefer Gateway/Nexus Core workflows for task, memory, and agent authority.
- CLI entry points are named `odysseus-*` for compatibility; renaming is deferred.

Primary app launchers:

| Platform | Script |
|----------|--------|
| macOS (Nexus Mac) | `../start-macos.sh` |
| Windows | `../launch-windows.ps1` |
| Docker | `../docker-compose.yml` |

Nexus Gateway bridge verification (Core + Console running):

```bash
# Core: cd /Users/bretthoffman/Documents/system && ./start-core-api.sh
# Console: cd /Users/bretthoffman/Documents/console && NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
./test_nexus_gateway_bridge.sh
```

Maps Console `GET /api/nexus/v1/packets` → Core `GET /tasks`. Simple Chat uses `POST /messages` (Bridge 05). CLI Mirror relay: `./test_nexus_cli_relay.sh` → `/api/nexus/v1/cli/sessions/*` (Bridge 08; Core needs `NEXUS_ENABLE_HERMES_PTY=true`). CLI Mirror UI: switch **Simple Chat | CLI Mirror** in Console Mode (Bridge 09–11). See `docs/console_reform/package_bridge_11_cli_mirror_session_resume_operator_controls.md`.

Embedded Hermes runtime (Nexus System — not `~/.hermes` or global PATH):

```bash
cd /Users/bretthoffman/Documents/system
HERMES_HOME="/Users/bretthoffman/Documents/system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes --help
HERMES_HOME="/Users/bretthoffman/Documents/system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes config
HERMES_HOME="/Users/bretthoffman/Documents/system/hermes_runtime" \
  hermes_runtime/hermes-agent/venv/bin/hermes doctor
```

Console Gateway reports embedded runtime status on `GET /api/nexus/v1/health` (`hermes_runtime` field). Resolver: `src/hermes_runtime.py`.

Archived Linux systemd installer: `docs/console_reform/legacy_archive/`.
