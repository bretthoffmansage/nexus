# Claudia Console / Gateway — Private & PWA Deployment Hardening

Operator guide for running Odysseus as **Claudia Console UI** and **Claudia Gateway API** on a dedicated Claudia Mac or trusted private network. This is **not** Claudia Core — Core runs separately in `claudia_system`.

## Security posture (summary)

| Environment | Access | Auth | LOCALHOST_BYPASS |
|-------------|--------|------|------------------|
| Local development | `127.0.0.1` only | `AUTH_ENABLED=true` (or dev-only bypass) | `true` only on localhost dev |
| Dedicated Claudia Mac | loopback + Tailscale/private LAN | **always** `true` | **false** |
| Mobile PWA | same private network as Console | **always** `true` | **false** |

**Never** expose raw app ports (`7000`, `7860`, etc.) directly to the public internet.

## Repository path

Claudia Console/Gateway checkout:

```text
/Users/bretthoffman/Documents/claudia_console
```

Claudia Core (separate repo) lives at `/Users/bretthoffman/Documents/claudia_system`. Console does **not** start Core.

## Local development

1. Copy `.env.example` to `.env` (never commit `.env`).
2. Set `CLAUDIA_CONSOLE_MODE=true` when testing Console/Gateway behavior.
3. Bind to loopback: `APP_BIND=127.0.0.1` (default).
4. Keep `AUTH_ENABLED=true` unless you explicitly need open local testing.
5. `LOCALHOST_BYPASS=true` is acceptable **only** for localhost-only dev.
6. Start from the repo root (folder name is not hardcoded — `./start-macos.sh` resolves paths relative to the script):

   ```bash
   cd /Users/bretthoffman/Documents/claudia_console
   ./start-macos.sh
   ```

   Opens at `http://127.0.0.1:7860` (native macOS default port).

7. Gateway health: `GET http://127.0.0.1:7860/api/claudia/v1/health` (or `:7000` for Docker) — review `deployment_warnings`.

## Dedicated Claudia Mac

The Claudia Mac is a **private control surface**, not a public SaaS host.

**Basic launch:**

```bash
cd /Users/bretthoffman/Documents/claudia_console
./start-macos.sh
```

**Recommended Claudia Console Mode launch** (env vars or `.env`):

```bash
cd /Users/bretthoffman/Documents/claudia_console
CLAUDIA_CONSOLE_MODE=true ./start-macos.sh
```

Or in `.env`:

```env
CLAUDIA_CONSOLE_MODE=true
AUTH_ENABLED=true
LOCALHOST_BYPASS=false
APP_BIND=127.0.0.1
CLAUDIA_CORE_URL=http://127.0.0.1:8080
CLAUDIA_GATEWAY_SHARED_SECRET=<set in local .env; never commit>
```

1. **Console Mode:** `CLAUDIA_CONSOLE_MODE=true`
2. **No competing authority:** `ODYSSEUS_INPROCESS_TASKS=0`, `ODYSSEUS_INPROCESS_POLLERS=0` (Console Mode also forces these off at startup).
3. **Bind locally:** `APP_BIND=127.0.0.1` — reach the UI via Tailscale Serve, SSH tunnel, or reverse proxy on the same machine.
4. **Auth on:** `AUTH_ENABLED=true`
5. **No bypass:** `LOCALHOST_BYPASS=false`
6. **Claudia Core:** `CLAUDIA_CORE_URL` pointing to loopback or Tailscale/private LAN only (e.g. `http://127.0.0.1:8080`).
7. **Gateway secret:** set `CLAUDIA_GATEWAY_SHARED_SECRET` whenever Core URL is set; rotate if leaked.
8. **Preserve** `./start-macos.sh` as the native macOS start path unless you have a documented alternative.

## Tailscale / private LAN access

Preferred near-term pattern for phone/laptop access without public exposure:

1. Install Tailscale on the Claudia Mac and client devices.
2. Bind Console to `127.0.0.1` on the Mac.
3. Use **Tailscale Serve** or a local reverse proxy bound to the Tailscale IP only — not `0.0.0.0` on the public internet.
4. Alternatively, restrict firewall so only RFC1918 / Tailscale CGNAT (`100.64.0.0/10`) can reach forwarded ports.
5. Keep `AUTH_ENABLED=true` and strong passwords / 2FA for admin accounts.
6. Do **not** publish Claudia Core or Ollama ports on the tailnet without equivalent auth/network policy.

## PWA / mobile access

Claudia Console is installable as a PWA (`static/manifest.json`).

1. Install only from your **trusted private URL** (Tailscale hostname or LAN IP behind auth).
2. PWA sessions use the same cookies/tokens as the browser — treat lost devices like compromised sessions; rotate API tokens if needed.
3. With HTTPS (reverse proxy or Tailscale Serve): set `SECURE_COOKIES=true`.
4. Restrict CORS / allowed origins to your private hostnames only (see `.env.example` if `CORS_ORIGINS` is used).
5. The PWA does **not** replace auth — it is a shell around the same authenticated API.

## HTTPS / reverse proxy (later)

When adding nginx, Caddy, or Tailscale Serve with TLS:

1. Terminate TLS at the proxy; keep the app on loopback.
2. `SECURE_COOKIES=true`
3. `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false`
4. Configure trusted `X-Forwarded-*` only if your proxy stack requires it (follow existing Odysseus docs).
5. Do not disable auth because TLS is enabled — TLS is transport, not authorization.

## Dangerous environment combinations

Avoid these on any network-accessible Claudia deployment:

| Combination | Risk |
|-------------|------|
| `AUTH_ENABLED=false` | Unauthenticated control of Gateway and legacy routes |
| `LOCALHOST_BYPASS=true` outside localhost dev | Session/auth bypass |
| `APP_BIND=0.0.0.0` on internet-facing host | Raw port exposure |
| `CLAUDIA_CORE_URL` public hostname | Core API exposed |
| Core URL set, no `CLAUDIA_GATEWAY_SHARED_SECRET` | Weak Gateway→Core trust |
| Public Ollama `11434` | Unguarded model API |
| Committing `.env`, tokens, or `data/` | Secret leak |

`GET /api/claudia/v1/health` returns `deployment_warnings` (no secret values) to help catch misconfiguration.

## Claudia Core URL and Gateway secret

- **Core** owns task loop, decisions, workers, tools, housekeeping, audits, workspace writes.
- **Gateway** forwards packets; it must not become Core.
- `CLAUDIA_CORE_URL` — loopback, `.ts.net`, or private LAN only.
- `CLAUDIA_GATEWAY_SHARED_SECRET` — shared with Core; sent as `X-Claudia-Gateway-Secret`; never log or commit.
- Do not expose Core’s raw HTTP API on the public internet.

## API tokens

- Issue Claudia-scoped tokens with least privilege (`claudia:read`, `claudia:intake`, etc.).
- Store tokens in password managers, not chat logs or screenshots.
- Rotate on leak; revoke in Settings.

## Ollama / local model ports

Ollama (`11434`) and local vLLM/llama.cpp ports are **internal-only**. Console may admin them for catalog/status; do not port-forward them to the public internet.

## Backups and secrets

- Back up `data/`, config, and skill/memory stores on the Claudia Mac with encryption at rest.
- Exclude secrets from backups shared broadly; rotate after restore to a new machine.
- Never commit `.env`, `data/auth.json`, API keys, or gateway secrets to Git.

## Related docs

- Reform packages: `docs/claudia_console_reform/package_*.md`
- `.env.example` — Claudia private deployment comments
- `SECURITY.md` — general Odysseus security policy
- `start-macos.sh` — native macOS start path
