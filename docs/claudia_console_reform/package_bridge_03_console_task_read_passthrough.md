# Package Bridge 03 — Console task read passthrough

| Field | Value |
|-------|-------|
| **Package** | Bridge 03 — Console task read passthrough to Nexus Core |
| **Date** | 2026-06-02 |
| **Repo** | `console` |

## Objective

Wire Nexus Gateway `GET /api/nexus/v1/packets` and `GET /api/nexus/v1/packets/{packet_id}` to Nexus Core Bridge 02 ledger endpoints (`GET /tasks`, `GET /tasks/{packet_id}`) so operators can inspect packets received by Core through the Console API.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_client.py` | `list_packets()`, `get_packet_detail()`, `sanitize_core_url()`; updated placeholders |
| `routes/nexus_routes.py` | `/packets` routes forward to Core when configured |
| `tests/test_nexus_packets_passthrough.py` | **New** — passthrough, 404, secret, agent_loop tests |
| `tests/test_nexus_source_worker_routes.py` | Placeholder status → `core_not_configured` |
| `scripts/test_nexus_gateway_bridge.sh` | **New** — Console intake + packet read E2E |
| `scripts/README.md` | Bridge test script docs |
| `docs/console_reform/package_bridge_03_console_task_read_passthrough.md` | **New** — this note |

## Routes changed

Public Gateway routes unchanged; behavior updated:

| Gateway route | Core route (when `NEXUS_CORE_URL` set) |
|---------------|------------------------------------------|
| `GET /api/nexus/v1/packets` | `GET {core}/tasks` |
| `GET /api/nexus/v1/packets/{packet_id}` | `GET {core}/tasks/{packet_id}` |

When Core is not configured, routes return safe placeholders with `status: core_not_configured`.

## Core forwarding behavior

**List (`/packets`)**

- Forwards to Core `/tasks`.
- Success: `ok: true`, `forwarded: true`, `source: nexus_core`, `core_url` (host[:port] only), `packets` and `items` from Core `tasks`.
- Unreachable: `ok: false`, `status: core_unreachable` (or `core_timeout`), empty lists.
- Not configured: placeholder with `status: core_not_configured`.

**Detail (`/packets/{id}`)**

- Forwards to Core `/tasks/{packet_id}`.
- Success: `packet` / `task` from Core ledger record.
- Core 404 → Gateway HTTP 404 with `{ "error": "not_found", ... }`.
- Not configured: placeholder with `packet: null`.

Console does **not** persist packets locally.

## Secret forwarding behavior

When `NEXUS_GATEWAY_SHARED_SECRET` is set on Console, all Core GET/POST forwards include:

`X-Nexus-Gateway-Secret: <secret>`

Secrets are never logged or included in Gateway JSON responses.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXUS_CONSOLE_MODE=true` | Recommended for Nexus Mac (demotes Odysseus authority) |
| `NEXUS_CORE_URL` | Core base URL (e.g. `http://127.0.0.1:8080`) |
| `NEXUS_GATEWAY_SHARED_SECRET` | Optional; must match Core when Core requires it |
| `NEXUS_GATEWAY_BEARER_TOKEN` | Optional; for `scripts/test_nexus_gateway_bridge.sh` when auth enabled |

## Tests / checks run

```bash
cd /Users/bretthoffman/Documents/Nexus/console
pytest -q tests/test_nexus_packets_passthrough.py
pytest -q tests/test_nexus_source_worker_routes.py
pytest -q tests/test_nexus_gateway_routes.py
pytest -q tests/test_console_mode.py
bash -n ./scripts/test_nexus_gateway_bridge.sh
```

## Manual test commands

**Terminal 1 — Core**

```bash
cd /Users/bretthoffman/Documents/Nexus/system
./start-core-api.sh
```

**Terminal 2 — Console**

```bash
cd /Users/bretthoffman/Documents/Nexus/console
NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Terminal 3 — curl or bridge script**

```bash
curl http://127.0.0.1:7860/api/nexus/v1/health

curl -X POST http://127.0.0.1:7860/api/nexus/v1/intake \
  -H "Content-Type: application/json" \
  -d '{"type":"message","route":"manual_test","payload":{"message":"Console packet read passthrough test"}}'

curl http://127.0.0.1:7860/api/nexus/v1/packets
```

Or:

```bash
cd /Users/bretthoffman/Documents/Nexus/console
./scripts/test_nexus_gateway_bridge.sh
```

With `AUTH_ENABLED=true`, create an API token with `nexus_intake,nexus_read` and:

```bash
export NEXUS_GATEWAY_BEARER_TOKEN=<token>
./scripts/test_nexus_gateway_bridge.sh
```

**Expected:** Intake packet appears in `/packets` with `source: nexus_core`, `forwarded: true`; detail route returns the same `packet_id`.

## Known limitations

- Gateway route names remain `/packets`; Core uses `/tasks` internally.
- No UI dashboard yet — API only.
- `GET /stream/{packet_id}` still placeholder.
- Auth required for Gateway routes when `AUTH_ENABLED=true` (health exempt).
- Status enum drift between Gateway normalization and Core contracts not resolved.
- Console does not cache Core responses.

## Next recommended package

**Bridge 04 — Gateway stream relay or operator dashboard read surface**

- Wire `GET /api/nexus/v1/stream/{packet_id}` to Core events when available, or
- Add minimal Console dashboard panel reading `/api/nexus/v1/packets` (read-only).

---

*End of Bridge 03 implementation note.*
