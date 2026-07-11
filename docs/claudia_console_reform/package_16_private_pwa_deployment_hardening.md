# Package 16 — Private/PWA deployment hardening

| Field | Value |
|-------|-------|
| **Package** | Package 16 — Private/PWA deployment hardening |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_15_legacy_ui_module_classification.md` |

## Objective

Harden and document legacy local console/Gateway private deployment expectations for a local/private PWA control surface on the dedicated Nexus Mac — documentation, env guidance, and read-only health warnings without public hosting automation or auth rewrites.

## Files changed

| File | Change |
|------|--------|
| `docs/console_reform/private_pwa_deployment_hardening.md` | **New** — operator private/PWA guide |
| `docs/console_reform/package_16_private_pwa_deployment_hardening.md` | **New** — this note |
| `src/nexus_deployment_posture.py` | **New** — `collect_deployment_warnings()` |
| `routes/nexus_routes.py` | Health enriched with `deployment_warnings` |
| `.env.example` | Nexus private deployment comment block |
| `static/js/nexusDashboard.js` | Read-only deployment warnings in health card |
| `static/style.css` | Dashboard warning list styles |
| `tests/test_nexus_private_deployment_hardening.py` | **New** |
| `SECURITY.md` | Pointer to Nexus private deployment guide |

## Behavior changed

### `GET /api/nexus/v1/health`

Adds `deployment_warnings`: array of `{code, severity, message}` objects. No secret values. Existing fields unchanged.

### Nexus dashboard

Health card shows Console Mode badge and deployment posture warnings when present (read-only).

### `.env.example`

Expanded legacy local console/Gateway section with Tailscale, bind, auth, bypass, in-process flags, Core URL/secret placeholders.

## Behavior intentionally unchanged

- Auth implementation, cookies, token names, CORS logic in `app.py`
- Gateway intake/forwarding, connector/execution/authority guards (P1–P15)
- `start-macos.sh` native start path
- Ollama/local model admin surfaces
- No Clerk, Convex, reverse proxy automation, or cert tooling

## Deployment docs added/updated

- **New:** `docs/console_reform/private_pwa_deployment_hardening.md`
- **Updated:** `SECURITY.md` (one bullet + link)
- **Updated:** `.env.example` comments

## Env guidance added/updated

`.env.example` now documents: `NEXUS_CONSOLE_MODE`, `APP_BIND`, `AUTH_ENABLED`, `LOCALHOST_BYPASS`, `SECURE_COOKIES`, `ODYSSEUS_INPROCESS_*`, `NEXUS_CORE_URL`, `NEXUS_GATEWAY_SHARED_SECRET`, Tailscale/private LAN, no public raw ports.

## Health/status warnings

**Implemented** in `src/nexus_deployment_posture.py` and exposed on health.

### Health warning matrix

| Warning | Trigger | Exposes secrets? | User action |
|---------|---------|------------------|-------------|
| `auth_disabled` | `AUTH_ENABLED=false` | No | Set `AUTH_ENABLED=true` |
| `localhost_bypass_enabled` | `LOCALHOST_BYPASS=true` | No | Disable outside localhost dev |
| `bind_all_interfaces` | `APP_BIND` or `ODYSSEUS_HOST` is `0.0.0.0` / `::` | No | Bind `127.0.0.1`; use Tailscale/proxy |
| `console_mode_off` | `NEXUS_CONSOLE_MODE` not true | No | Enable on dedicated Nexus Mac |
| `gateway_secret_missing` | Core URL set, secret empty | No | Set `NEXUS_GATEWAY_SHARED_SECRET` |
| `core_url_public_or_unknown` | Core host not loopback/private/Tailscale | No | Use private Core URL only |
| `inprocess_tasks_enabled` | `ODYSSEUS_INPROCESS_TASKS` on and console mode off | No | Console mode or set tasks=0 |

**Deferred:** `SECURE_COOKIES=false` over HTTPS, explicit CORS wildcard warnings, Ollama reachability probe (would require network calls).

## Deployment hardening matrix

| Area | Required posture | Package 16 change | Remaining follow-up |
|------|------------------|-------------------|---------------------|
| local dev | `127.0.0.1`, auth on, bypass dev-only | Documented in guide + `.env.example` | Optional dev checklist in README |
| dedicated Nexus Mac | Console mode, no in-process authority | Documented + health `console_mode_off` | LaunchAgent/plist hardening out of scope |
| Tailscale/private LAN | Private access only, no public bind | Documented + `core_url` / bind warnings | Tailscale Serve examples not automated |
| PWA/mobile | Trusted private URL + auth | Documented | Manifest/cache refresh UX |
| auth | `AUTH_ENABLED=true` | Warning `auth_disabled` | No auth rewrite |
| localhost bypass | `false` outside dev | Warning `localhost_bypass_enabled` | — |
| cookies/HTTPS | `SECURE_COOKIES=true` behind TLS | Documented in guide | No runtime warning yet |
| CORS/origins | Restrict to private hosts | Documented | No CORS audit in health |
| Nexus Core URL | Loopback/private/Tailscale | Warning `core_url_public_or_unknown` | — |
| Gateway shared secret | Set when Core configured | Warning `gateway_secret_missing` | — |
| API tokens | Least privilege, rotate on leak | Documented | No token scanner |
| Ollama/local model ports | Internal-only | Documented | No port probe |
| raw public ports | Never expose 7000/7860 publicly | Warning `bind_all_interfaces` | Firewall automation out of scope |
| backups/secrets | Encrypt, no secrets in Git | Documented | — |

## PWA/private access guidance

See `private_pwa_deployment_hardening.md`: install PWA only from trusted private URL; same auth as browser; `SECURE_COOKIES` with HTTPS; Tailscale preferred for mobile.

## Secrets handling notes

- Health warnings never include env secret values or `NEXUS_GATEWAY_SHARED_SECRET`.
- `.env.example` uses placeholders only.
- Guide stresses protect Core URL, gateway secret, API tokens, `.env`, `data/`.

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_nexus_private_deployment_hardening.py \
  tests/test_nexus_legacy_ui_classification.py \
  tests/test_nexus_branding.py \
  tests/test_nexus_authority_demotion.py \
  tests/test_nexus_execution_surface_guards.py \
  tests/test_nexus_connector_email_calendar_guards.py \
  tests/test_nexus_approval_routes.py \
  tests/test_nexus_dashboard_skeleton.py \
  tests/test_nexus_upload_processing_guards.py \
  tests/test_nexus_upload_bridge.py \
  tests/test_nexus_source_worker_routes.py \
  tests/test_nexus_messages.py \
  tests/test_nexus_chat_demotion.py \
  tests/test_nexus_gateway_routes.py \
  tests/test_nexus_token_scopes.py \
  tests/test_nexus_packets.py \
  tests/test_console_mode.py
```

## Results

- `python3 -m compileall -q app.py core routes src`: **pass**
- Focused Nexus tests (P1–P16): **147 passed**
- New Package 16 tests: **11 passed**

## Known pytest baseline issue from Package 0

Collect-only may report 2 pre-existing errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

Not fixed in Package 16.

## Risks

- Health endpoint is unauthenticated; warnings are operational hints only (no secrets).
- Bind/Core checks are heuristic (hostname parsing); unusual private DNS may false-positive `core_url_public_or_unknown`.
- Dashboard warnings depend on health fetch; stale cache unlikely on dashboard load.

## Follow-ups

- Package 17: final competing-authority cleanup audit.
- Optional: `SECURE_COOKIES` / CORS warnings when served over HTTPS.
- README pointer to Nexus guide (skipped to minimize scope).

## Next recommended package

**Package 17 — Final competing-authority cleanup audit**
