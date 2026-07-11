# Docker assets

Reference/compatibility deployment for Odysseus / legacy local console — **not** the primary path for the dedicated Nexus Mac (use `./start-macos.sh` natively for GPU/Cookbook).

legacy local console checkout: `/Users/bretthoffman/Documents/console`

- `../Dockerfile` — application image
- `../docker-compose.yml` — compose stack (bind to localhost by default)
- `entrypoint.sh`, `gpu.*.yml` — optional GPU overrides

Private deployment posture: `docs/console_reform/private_pwa_deployment_hardening.md`
