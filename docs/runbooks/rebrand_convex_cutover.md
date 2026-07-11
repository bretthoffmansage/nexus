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

1. **After the next Vercel deploy** of the console, remove the deprecated
   `getClaudiaSystemStatusForPage` alias query in
   `convex/connectorRegistry.ts` (kept only for the currently-deployed
   bundle) and run `npx convex dev --once`.
2. **Repoint the LAN GPT action** from
   `/api/v1/viktor/knowledge-query` to `/api/v1/vault/knowledge-query`, then
   delete the deprecated alias route in the system repo's `core_api/app.py`.
3. Tasks submitted by the pre-redeploy frontend still carry the old
   `obsidian.dropzone.process_document` id; they stay queued and unclaimable —
   resubmit them after the redeploy if any exist.

The system stack can be started again: `.env` already says
`NEXUS_CONNECTOR_ID=console-primary`, matching the renamed row.
