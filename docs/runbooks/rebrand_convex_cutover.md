# Rebrand cutover: Convex runtime steps (one-time)

The phase-5 rebrand renamed three things that live in the Convex dev deployment
(`dev:doting-raven-338`) as stored state, not code. All repo code is already
committed on the new names. Run these once, in order, from the console repo —
**keep the system stack stopped until every step is done**.

Prereq: `npx convex dev` login prompt must succeed with the account that owns
team `blue-melnick-fa2a1` / project `nexus` (the CLI token on this machine
currently lacks access).

```bash
cd /Users/bretthoffman/Documents/Nexus/console

# 1. Deploy the transitional schema + functions (new systemStatus field,
#    deprecated claudiaSystemStatus kept optional, migration mutations,
#    deprecated getClaudiaSystemStatusForPage alias for the live Vercel bundle).
npx convex dev --once

# 2. Clear the pre-rebrand status snapshot (ephemeral heartbeat data;
#    repopulates under the new field/keys on the first new heartbeat).
npx convex run migrations:clearLegacySystemStatusField

# 3. Rename the connector row in place (keeps secret, allowlist, history).
npx convex run migrations:renameConnectorId '{"from":"claudia-primary","to":"console-primary"}'

# 4. Point the allowlist at the renamed dropzone tool id.
npx convex run connectorRegistry:setConnectorAllowedTools '{"connectorId":"console-primary","allowedToolIds":["vault.agentic_retrieval","membership_io.transcript_retrieve","vault.dropzone.process_document"]}'
```

Then clean up the transitional pieces (or ask Claude to):

1. Delete `convex/migrations.ts`.
2. Remove the deprecated `claudiaSystemStatus: v.optional(v.any())` line from
   `convex/schema.ts`.
3. After the next Vercel deploy of the console, remove the deprecated
   `getClaudiaSystemStatusForPage` alias query in `convex/connectorRegistry.ts`
   (the deployed bundle stops calling it once redeployed).
4. `npx convex dev --once` again to push the cleanup.

Notes

- `.env` in the system repo already says `NEXUS_CONNECTOR_ID=console-primary`;
  starting the connector before step 3 would heartbeat an unknown id and fail
  (harmless, but it will not claim work).
- Tasks submitted by the currently-deployed frontend still carry the old
  `obsidian.dropzone.process_document` id until Vercel redeploys; after step 4
  they simply stay queued and unclaimable. Resubmit them after the redeploy if
  any exist.
- The system Core API keeps a deprecated route alias at
  `/api/v1/viktor/knowledge-query` for the LAN GPT action; repoint that action
  to `/api/v1/vault/knowledge-query` and then delete the alias route in
  `core_api/app.py`.
