# Docker assets

Reference/compatibility deployment for Odysseus / Claudia Console — **not** the primary path for the dedicated Claudia Mac (use `./start-macos.sh` natively for GPU/Cookbook).

Claudia Console checkout: `/Users/bretthoffman/Documents/claudia_console`

- `../Dockerfile` — application image
- `../docker-compose.yml` — compose stack (bind to localhost by default)
- `entrypoint.sh`, `gpu.*.yml` — optional GPU overrides

Private deployment posture: `docs/claudia_console_reform/private_pwa_deployment_hardening.md`
