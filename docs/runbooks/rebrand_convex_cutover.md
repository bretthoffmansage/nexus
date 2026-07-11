# Rebrand cutover: Convex runtime steps

**Status: completed 2026-07-10.** The dev deployment (`dev:doting-raven-338`)
now holds the post-rebrand state: connector row `console-primary` (display
name "Console Primary"), allowlist `vault.agentic_retrieval`,
`membership_io.transcript_retrieve`, `vault.dropzone.process_document`, the
`systemStatus` heartbeat field (legacy `claudiaSystemStatus` cleared and
dropped from the schema), and the one-off migration mutations removed again.
The stored `softwareVersion` still reads `claudia-p7-connector-v1` until the
renamed connector's first heartbeat reports `nexus-p7-connector-v1`.

Remaining follow-ups:

1. ~~Remove the deprecated `getClaudiaSystemStatusForPage` alias query~~ —
   **done 2026-07-10** after the Vercel redeploy: alias deleted from
   `convex/connectorRegistry.ts` and pushed with `npx convex dev --once`.
2. ~~Repoint the external LAN caller and delete the viktor alias route~~ —
   **done 2026-07-10.** The caller was a Fable instance on another LAN machine
   (not a GPT) with the old URL in its task prompt; the operator hands it
   `/api/v1/vault/knowledge-query` directly. Alias route deleted from
   `core_api/app.py` (system commit 1a6c91f).
3. Tasks submitted by the pre-redeploy frontend still carry the old
   `obsidian.dropzone.process_document` id; they stay queued and unclaimable —
   resubmit them after the redeploy if any exist.

The system stack can be started again: `.env` already says
`NEXUS_CONNECTOR_ID=console-primary`, matching the renamed row.
