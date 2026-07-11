# legacy local console / Gateway — Operator Handoff

Practical guide for running the reformed Odysseus codebase as **legacy local console UI** and **Nexus Gateway API**. Read this first; detailed reform history lives under `docs/console_reform/`.

---

## 1. What this repo is now

- **legacy local console UI** — authenticated web/PWA control surface (chat, dashboard, approvals, uploads, read-only connectors, model admin).
- **Nexus Gateway API** — `/api/nexus/v1/*` forward-only routes (intake, messages, sources, worker-output, health, approvals).
- **Private deployment shell** — designed for a dedicated Nexus Mac on loopback or Tailscale/private LAN.

Checkout path:

```text
/Users/bretthoffman/Documents/console
```

## 2. What this repo is not

- **Not Nexus Core** — no task loop, worker execution, final authority, or autonomous housekeeping.
- **Not a public SaaS** — do not expose raw ports to the internet.
- **Not a full Odysseus agent host** in Console Mode — local agent loop, shell, MCP spawn, connector writes, and generative gallery are demoted/blocked.

## 3. Where Nexus Core lives

```text
/Users/bretthoffman/Documents/system
```

Core runs separately. Console does **not** start Core. Point Gateway at Core only when Core is running and reachable on loopback or private LAN.

## 4. How to launch legacy local console

**Basic launch:**

```bash
cd /Users/bretthoffman/Documents/console
./start-macos.sh
```

Opens at `http://127.0.0.1:7860`.

**Recommended Console Mode launch:**

```bash
cd /Users/bretthoffman/Documents/console
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

The script resolves paths from its own location — the folder name does not need to be `odysseus`.

## 5. Recommended `.env` values

Copy `.env.example` to `.env` (never commit `.env`):

```env
NEXUS_CONSOLE_MODE=true
AUTH_ENABLED=true
LOCALHOST_BYPASS=false
APP_BIND=127.0.0.1
NEXUS_CORE_URL=http://127.0.0.1:8080
NEXUS_GATEWAY_SHARED_SECRET=<set locally; never commit>
```

Set `NEXUS_CORE_URL` and `NEXUS_GATEWAY_SHARED_SECRET` only when Nexus Core is running at `/Users/bretthoffman/Documents/system` (never commit secrets).

Console Mode also forces off in-process task scheduler, email pollers, bg_monitor, and nightly skill audit regardless of `ODYSSEUS_INPROCESS_*`.

## 6. How to verify it is running

1. Browser: open `http://127.0.0.1:7860` and log in.
2. Gateway health (no auth required):

   ```bash
   curl -s http://127.0.0.1:7860/api/nexus/v1/health | python3 -m json.tool
   ```

   Expect `console_mode: true` when Console Mode is on, plus `deployment_warnings` (no secret values).

3. UI: Nexus dashboard tab shows health, deployment warnings, and Console Mode indicators.
4. Startup logs: look for `[nexus-console]` skip lines when Console Mode is active.

**Note:** Package 20 validation did not run a live long-running server smoke test in CI; verify on your Nexus Mac after launch.

## 7. How to use legacy local console Mode

Set `NEXUS_CONSOLE_MODE=true` in `.env` or the shell before `./start-macos.sh`.

Console Mode:

- Skips competing in-process autonomy (scheduler, pollers, bg_monitor, skill audit seed).
- Routes chat through Nexus message packets → Core when `NEXUS_CORE_URL` is set.
- Blocks local agent loop, shell, MCP connect/spawn, connector writes, memory/skills writes, research runs, task runs, cookbook subprocesses, and gallery AI generation.
- Preserves auth, PWA, dashboard, Gateway API, read surfaces, Ollama/model admin, and gallery browsing.

Legacy Odysseus behavior returns when `NEXUS_CONSOLE_MODE` is off (not recommended for Nexus Mac production).

## 8. How Gateway connects to Nexus Core

| Setting | Purpose |
|---------|---------|
| `NEXUS_CORE_URL` | Base URL for Core (loopback or private LAN only) |
| `NEXUS_GATEWAY_SHARED_SECRET` | Sent as `X-Nexus-Gateway-Secret`; required when Core URL is set |

Gateway routes (`/api/nexus/v1/intake`, `/messages`, `/sources`, `/worker-output`) normalize Nexus packets and **forward** to Core. Gateway does not execute tools, agents, or tasks locally.

Health probes Core when URL is configured. Chat/message forwarding uses Core `POST /messages` with fallback to `/intake`.

## 9. What is intentionally disabled in Console Mode

| Area | Disabled behavior |
|------|-------------------|
| Startup | Task scheduler, default task seed, email pollers, bg_monitor, nightly skill audit |
| Chat (local) | `stream_agent_loop`, local LLM/agent execution |
| Execution | Shell, MCP spawn/connect, research runs, task/assistant runs, cookbook download/serve |
| Connectors | Email send/schedule/draft/IMAP mutators; calendar event create/update/delete |
| Authority | Memory/skills writes, document archive/restore, upload vision/RAG processing |
| Gallery | AI upscale, inpaint, style transfer, and related generative routes |

All return structured blocked responses (`local_execution_disabled`, `connector_write_disabled`, `authority_disabled`, etc.) with `console_mode: true`.

## 10. What is preserved

- Login/auth, 2FA, API tokens (Nexus scopes)
- PWA/mobile shell and Nexus branding
- Nexus dashboard and approvals UI
- Gateway API (forward-only)
- Chat UI (packet bridge to Core)
- Upload staging → source packets (no local vision/RAG in Console Mode)
- Email/calendar **read** surfaces and date-time parsing
- Document library read/export
- Memory/skills **read/search**
- Model/Ollama admin and status (catalog/config; not cookbook serve in Console Mode)
- Gallery browse/library/assets (not generative execution)
- Docker/Windows compatibility launchers
- Companion/mobile pairing routes

## 11. Private/PWA access rules

See [`private_pwa_deployment_hardening.md`](private_pwa_deployment_hardening.md).

Summary:

- Bind `127.0.0.1`; reach via Tailscale Serve, SSH tunnel, or local reverse proxy.
- Always `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false` on network-accessible deployments.
- Never expose raw ports (`7860`, `7000`, Ollama `11434`, Core) to the public internet.
- Install PWA only from your trusted private URL.
- Set `SECURE_COOKIES=true` when served over HTTPS.

## 12. Known remaining caveats

- **Core integration:** Real Core streaming/event relay is placeholder until Core API is live.
- **Task metadata CRUD:** Task create/update still allowed; scheduler does not run in Console Mode.
- **Internal identifiers:** Cookies/headers still use `odysseus_*` names (intentional compatibility).
- **Upstream GitHub repo** still named `odysseus`; local checkout is `console`.
- **Historical package notes** (00–19) record the pre-rename checkout folder name — historical only.
- **pytest baseline:** Two pre-existing collection errors in full suite (see §14).

## 13. Troubleshooting

| Symptom | Check |
|---------|-------|
| Port in use | `ODYSSEUS_PORT=7900 ./start-macos.sh` or stop existing process |
| Auth loop / bypass | `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false` for LAN/Tailscale |
| Chat returns Core unreachable | Set `NEXUS_CORE_URL`; ensure Core is running; check `deployment_warnings` |
| Gateway secret warning | Set `NEXUS_GATEWAY_SHARED_SECRET` when Core URL is set |
| Cookbook serve blocked | Expected in Console Mode; use legacy mode only on non-Nexus dev hosts |
| Deployment warnings in health | Review `/api/nexus/v1/health` → `deployment_warnings` |
| PWA stale UI | Service worker cache `nexus-console-v1`; hard refresh or reinstall |

## 14. Final launch command

```bash
cd /Users/bretthoffman/Documents/console
NEXUS_CONSOLE_MODE=true ./start-macos.sh
```

---

**Related docs**

- [`private_pwa_deployment_hardening.md`](private_pwa_deployment_hardening.md) — deployment posture
- [`package_20_final_safety_audit_operator_handoff.md`](package_20_final_safety_audit_operator_handoff.md) — full audit closeout
- [`final_console_gateway_checklist.md`](final_console_gateway_checklist.md) — quick verification checklist
