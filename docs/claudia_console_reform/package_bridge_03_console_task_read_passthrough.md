# Package Bridge 03 — Console task read passthrough

| Field | Value |
|-------|-------|
| **Package** | Bridge 03 — Console task read passthrough to Claudia Core |
| **Date** | 2026-06-02 |
| **Repo** | `claudia_console` |

## Objective

Wire Claudia Gateway `GET /api/claudia/v1/packets` and `GET /api/claudia/v1/packets/{packet_id}` to Claudia Core Bridge 02 ledger endpoints (`GET /tasks`, `GET /tasks/{packet_id}`) so operators can inspect packets received by Core through the Console API.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_client.py` | `list_packets()`, `get_packet_detail()`, `sanitize_core_url()`; updated placeholders |
| `routes/claudia_routes.py` | `/packets` routes forward to Core when configured |
| `tests/test_claudia_packets_passthrough.py` | **New** — passthrough, 404, secret, agent_loop tests |
| `tests/test_claudia_source_worker_routes.py` | Placeholder status → `core_not_configured` |
| `scripts/test_claudia_gateway_bridge.sh` | **New** — Console intake + packet read E2E |
| `scripts/README.md` | Bridge test script docs |
| `docs/claudia_console_reform/package_bridge_03_console_task_read_passthrough.md` | **New** — this note |

## Routes changed

Public Gateway routes unchanged; behavior updated:

| Gateway route | Core route (when `CLAUDIA_CORE_URL` set) |
|---------------|------------------------------------------|
| `GET /api/claudia/v1/packets` | `GET {core}/tasks` |
| `GET /api/claudia/v1/packets/{packet_id}` | `GET {core}/tasks/{packet_id}` |

When Core is not configured, routes return safe placeholders with `status: core_not_configured`.

## Core forwarding behavior

**List (`/packets`)**

- Forwards to Core `/tasks`.
- Success: `ok: true`, `forwarded: true`, `source: claudia_core`, `core_url` (host[:port] only), `packets` and `items` from Core `tasks`.
- Unreachable: `ok: false`, `status: core_unreachable` (or `core_timeout`), empty lists.
- Not configured: placeholder with `status: core_not_configured`.

**Detail (`/packets/{id}`)**

- Forwards to Core `/tasks/{packet_id}`.
- Success: `packet` / `task` from Core ledger record.
- Core 404 → Gateway HTTP 404 with `{ "error": "not_found", ... }`.
- Not configured: placeholder with `packet: null`.

Console does **not** persist packets locally.

## Secret forwarding behavior

When `CLAUDIA_GATEWAY_SHARED_SECRET` is set on Console, all Core GET/POST forwards include:

`X-Claudia-Gateway-Secret: <secret>`

Secrets are never logged or included in Gateway JSON responses.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CLAUDIA_CONSOLE_MODE=true` | Recommended for Claudia Mac (demotes Odysseus authority) |
| `CLAUDIA_CORE_URL` | Core base URL (e.g. `http://127.0.0.1:8080`) |
| `CLAUDIA_GATEWAY_SHARED_SECRET` | Optional; must match Core when Core requires it |
| `CLAUDIA_GATEWAY_BEARER_TOKEN` | Optional; for `scripts/test_claudia_gateway_bridge.sh` when auth enabled |

## Tests / checks run

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
pytest -q tests/test_claudia_packets_passthrough.py
pytest -q tests/test_claudia_source_worker_routes.py
pytest -q tests/test_claudia_gateway_routes.py
pytest -q tests/test_claudia_console_mode.py
bash -n ./scripts/test_claudia_gateway_bridge.sh
```

## Manual test commands

**Terminal 1 — Core**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_system
./start-core-api.sh
```

**Terminal 2 — Console**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Terminal 3 — curl or bridge script**

```bash
curl http://127.0.0.1:7860/api/claudia/v1/health

curl -X POST http://127.0.0.1:7860/api/claudia/v1/intake \
  -H "Content-Type: application/json" \
  -d '{"type":"message","route":"manual_test","payload":{"message":"Console packet read passthrough test"}}'

curl http://127.0.0.1:7860/api/claudia/v1/packets
```

Or:

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
./scripts/test_claudia_gateway_bridge.sh
```

With `AUTH_ENABLED=true`, create an API token with `claudia_intake,claudia_read` and:

```bash
export CLAUDIA_GATEWAY_BEARER_TOKEN=<token>
./scripts/test_claudia_gateway_bridge.sh
```

**Expected:** Intake packet appears in `/packets` with `source: claudia_core`, `forwarded: true`; detail route returns the same `packet_id`.

## Known limitations

- Gateway route names remain `/packets`; Core uses `/tasks` internally.
- No UI dashboard yet — API only.
- `GET /stream/{packet_id}` still placeholder.
- Auth required for Gateway routes when `AUTH_ENABLED=true` (health exempt).
- Status enum drift between Gateway normalization and Core contracts not resolved.
- Console does not cache Core responses.

## Next recommended package

**Bridge 04 — Gateway stream relay or operator dashboard read surface**

- Wire `GET /api/claudia/v1/stream/{packet_id}` to Core events when available, or
- Add minimal Console dashboard panel reading `/api/claudia/v1/packets` (read-only).

---

*End of Bridge 03 implementation note.*
