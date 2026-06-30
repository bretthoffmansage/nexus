# Claudia Console / Gateway — Final Verification Checklist

Quick operator checklist after Packages 0–19 and 20A. Full audit: [`package_20_final_safety_audit_operator_handoff.md`](package_20_final_safety_audit_operator_handoff.md).

## Launch

- [ ] Checkout at `/Users/bretthoffman/Documents/claudia_console`
- [ ] `.env` copied from `.env.example` (not committed)
- [ ] `CLAUDIA_CONSOLE_MODE=true`, `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false`, `APP_BIND=127.0.0.1`
- [ ] Run: `cd /Users/bretthoffman/Documents/claudia_console && ./start-macos.sh`
- [ ] Browser opens `http://127.0.0.1:7860`

## Health & posture

- [ ] `GET /api/claudia/v1/health` returns 200
- [ ] `claudia_console_mode: true` in health JSON
- [ ] Review `deployment_warnings` — no public bind, auth on, secret set if Core URL configured
- [ ] Startup logs show `[claudia-console]` skips for scheduler/pollers/bg_monitor

## UI & branding

- [ ] Login page shows Claudia-oriented branding
- [ ] Main app title/branding visible as Claudia Console
- [ ] Claudia dashboard tab loads health and warnings

## Console Mode safety (spot checks)

- [ ] Chat submits without local agent loop (packet/SSE or Core-forward message)
- [ ] Shell/MCP/research routes return blocked JSON in Console Mode
- [ ] Email send / calendar create return `connector_write_disabled`
- [ ] Gallery AI generate routes blocked; library browse works
- [ ] Cookbook download/serve blocked; model status/read works

## Gateway

- [ ] `/api/claudia/v1/intake` accepts packets (token or session)
- [ ] `/api/claudia/v1/messages` forwards when Core URL set
- [ ] Approvals list/resolve routes respond
- [ ] Gateway does not execute tools locally

## Preserved surfaces

- [ ] Auth login/logout works
- [ ] PWA manifest/installable from private URL
- [ ] Ollama/model admin or status visible (no requirement to call Ollama)
- [ ] Email/calendar read surfaces load (if configured)

## Optional Core wiring

- [ ] Claudia Core running at `/Users/bretthoffman/Documents/claudia_system` (`./start-core-api.sh`)
- [ ] `CLAUDIA_CORE_URL=http://127.0.0.1:8080` in local `.env`
- [ ] `CLAUDIA_GATEWAY_SHARED_SECRET` set in local `.env` only
- [ ] `curl -sS http://127.0.0.1:8080/health` and Gateway health show Core reachable

## Not in scope for this checklist

- Full pytest suite (2 known collect-only errors)
- Live Ollama/model inference calls
- Live email/calendar API calls
- Public internet exposure
