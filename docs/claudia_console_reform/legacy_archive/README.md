# Legacy archive (Package 18)

Non-primary deployment and marketing artifacts moved here during the legacy local console reform. **Nothing was deleted** — restore by copying files back to their original paths.

| Archived file | Original path | Why archived |
|---------------|---------------|--------------|
| `install-service.sh` | `install-service.sh` | Linux systemd installer; not used on the dedicated Nexus Mac (`start-macos.sh` is primary). |
| `odysseus-ui.service` | `odysseus-ui.service` | systemd unit paired with `install-service.sh`. |
| `docs_index.html` | `docs/index.html` | Duplicate Odysseus marketing page; served landing is `static/landing.html` (Nexus-branded). |

## Restore

```bash
# From repository root:
cp docs/console_reform/legacy_archive/install-service.sh .
cp docs/console_reform/legacy_archive/odysseus-ui.service .
cp docs/console_reform/legacy_archive/docs_index.html docs/index.html
```

Edit `odysseus-ui.service` paths before running `install-service.sh`.

## Active deployment paths

- **Nexus Mac (primary):** from `/Users/bretthoffman/Documents/console`, run `./start-macos.sh` — see `docs/console_reform/private_pwa_deployment_hardening.md`
- **Windows (compatibility):** `launch-windows.ps1`
- **Docker (compatibility):** `docker-compose.yml`, `Dockerfile`
