# Nexus Claudia system status heartbeat projection (v1)

Package: `nexus_claudia_system_status_heartbeat_projection_v1`

## Architecture

```
Claudia Control Center / service-control
  → existing Connector heartbeat
  → POST /api/connector/v1/heartbeat
  → Nexus heartbeat parser + `nexusConnectors` persistence
  → private `getClaudiaSystemStatusForPage` query
  → Status page seven-card UI
```

No new HTTP endpoint, poller, WebSocket, worker, or direct Mac connection.

## Optional heartbeat contract

Field: `systemStatus` (optional, additive)

Contract version: `claudia_system_status_v1`

Allowed component keys (exactly seven):

- `core_api`
- `nexus_connector`
- `viktor_retrieval`
- `sage_knowledge_base`
- `claude_cli`
- `codex_cli`
- `cleanup_storage`

Each component value: `{ active: boolean, observedAt: ISO-8601 UTC with Z }`

Top-level fields persisted when valid: `contractVersion`, `snapshotId`, `snapshotObservedAt`, `sessionId`, `components`

Not persisted to UI: raw heartbeat JSON, session/snapshot IDs in query response, paths, URLs, PIDs, tokens.

## Validation

`convex/lib/claudiaSystemStatus.ts` — `parseClaudiaSystemStatus()`

- Missing `systemStatus` → heartbeat accepted; presence updated; component snapshot unchanged.
- Malformed `systemStatus` → heartbeat accepted; snapshot cleared (fail closed); no user-facing validation errors.
- Unknown component keys → entire snapshot rejected.
- Invalid component entries → omitted (inactive).
- Wrong contract version → rejected.

## Freshness thresholds

| Signal | Threshold |
|--------|-----------|
| Connector online/offline | `P6_LEASE.connectorOfflineThresholdMs` (90s) via `lastHeartbeatAt` |
| Whole snapshot | same 90s via `snapshotObservedAt` |
| Claude/Codex CLI component | `P6_SYSTEM_STATUS.cliObservationTtlMs` (24h) |

Stale Connector heartbeat → **all seven cards** lose green (no stale green retention).

## Green / no-light semantics

Green dot only when:

1. Fresh Connector heartbeat
2. Valid `systemStatus` present (except backward-compatible Nexus Connector-only case below)
3. Fresh snapshot timestamp
4. Component present, `active === true`, fresh `observedAt`

No yellow/red/gray idle dots. No light = not live.

## Old Connector compatibility

Fresh heartbeat without `systemStatus`:

- Heartbeat accepted; Connector presence works as before.
- **Nexus Connector** card may show live (heartbeat-only backward compatibility).
- Other six cards: not green; status `Detailed system status unavailable`.

## Status page

- Removed `ToolAvailabilityBanner` (“Partially available”).
- Removed legacy Claudia yellow presence card, empty diagnostics shell, protocol note.
- Subtitle: `Claudia system connectivity and service health`
- Seven hardcoded cards in responsive two-column grid (`ClaudiaSystemStatusPanel`).

## Focused tests

- `tests/nexus-claudia-system-status-heartbeat.test.ts`
- `tests/nexus-claudia-system-status-page.test.tsx`
- `tests/nexus-p6-auth.test.ts` (heartbeat regression)

## Activation (operator)

On Claudia host after Nexus deploy:

```yaml
# config/service_control.yaml
status_publication:
  enabled: true
```

Restart the Claudia Nexus Connector.

## Live smoke

1. Deploy Nexus with this package.
2. Enable `status_publication.enabled: true` on Claudia.
3. Restart Connector.
4. Confirm heartbeat includes `systemStatus`.
5. Open `/status` — seven cards; active fresh components green.
6. Stop Connector ≥ 90s — all greens clear.
7. Restart — recovery on fresh heartbeat.
8. Older Connector without `systemStatus` still accepted; only Connector card may be live.

## Rollback

Revert Nexus deploy; Status page falls back to prior build. Older Connectors unaffected. Clearing `claudiaSystemStatus` is safe.
