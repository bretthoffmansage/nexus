#!/usr/bin/env bash
# Nexus hosted-application boundary check (repository root).
# Scans root Next.js source only; legacy_local_console/ is excluded.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SCAN_GLOBS=(
  "$ROOT/app"
  "$ROOT/components"
  "$ROOT/lib"
  "$ROOT/convex"
  "$ROOT/styles"
  "$ROOT/tests"
  "$ROOT/proxy.ts"
)

PATTERNS=(
  'CLAUDIA_CORE_URL'
  '/api/claudia/v1'
  '/api/chat_stream'
  'direct Hermes invocation'
  'CLI Mirror'
  'claudiaCliMirror'
  'Hermes PTY'
  'shell_routes'
  'subprocess'
  'sqlite'
  'data/auth\.json'
  'NEXT_PUBLIC_CLERK_SECRET_KEY'
  'NEXT_PUBLIC_.*SECRET'
  'unsigned webhook'
  'selfApprove'
  'odysseus_session'
  '~/.hermes'
  '\.local/bin/hermes'
  'EventSource'
  'stream_agent_loop'
  'legacy_local_console/static'
  'legacy_local_console/routes'
  '/api/email/'
  '/api/tasks'
  '/api/calendar'
  '/api/shell'
  '/api/models'
  'chat_stream'
  'claudiaCliMirrorHelpers'
  'from fastapi'
  'import uvicorn'
)

FAIL=0
for pattern in "${PATTERNS[@]}"; do
  if rg -n "$pattern" "${SCAN_GLOBS[@]}" \
    --glob '!**/*.md' \
    --glob '!node_modules/**' \
    --glob '!.next/**' \
    --glob '!package-lock.json' \
    --glob '!convex/_generated/**' \
    --glob '!scripts/verify-nexus-boundary.sh' \
    --glob '!lib/navigation/toolRegistry.ts' \
    --glob '!components/workspace/**' \
    --glob '!styles/legacy-port.css' \
    --glob '!tests/boundary-static.test.ts' \
    --glob '!tests/nexus-p4-auth.test.ts' \
    --glob '!tests/nexus-p4-1-clerk-integration.test.ts' \
    --glob '!tests/nexus-p4-4-legacy-workspace-port.test.tsx' 2>/dev/null; then
    echo "Boundary violation: found '$pattern' in hosted Nexus source"
    FAIL=1
  fi
done

# --- P5 ownership/queue boundary -------------------------------------------
# Ordinary user mutations/queries must derive ownership and queue position from
# the verified identity — never from client arguments. schema.ts legitimately
# declares these as table fields, so it is intentionally excluded from this set.
P5_PUBLIC_MODULES=(
  "$ROOT/convex/conversations.ts"
  "$ROOT/convex/messages.ts"
  "$ROOT/convex/tasks.ts"
  "$ROOT/convex/taskProgress.ts"
  "$ROOT/convex/taskResults.ts"
  "$ROOT/convex/taskSources.ts"
  "$ROOT/convex/diagnostics.ts"
)
P5_INJECTION='(ownerClerkUserId|clerkUserId|ownerId|userId|requestingUserId|queueSequence|priority|role|permission)\s*:\s*v\.'
if rg -n "$P5_INJECTION" "${P5_PUBLIC_MODULES[@]}" 2>/dev/null; then
  echo "Boundary violation: client-trusted owner/role/queue argument in a public P5 module"
  FAIL=1
fi

# Ordinary users must not enumerate the global queue: the cross-owner status
# indexes may only be referenced by the admin-gated diagnostics module and the
# trusted Connector claim/recovery functions (connectorTasks.ts).
if rg -n 'by_status_and_queue_sequence|by_queue_sequence|by_status_and_lease_expires_at' \
  "$ROOT/convex/tasks.ts" "$ROOT/convex/conversations.ts" "$ROOT/convex/messages.ts" 2>/dev/null; then
  echo "Boundary violation: global queue index referenced from a user-facing module"
  FAIL=1
fi

# --- P6 trusted Connector protocol boundary --------------------------------
# P6 intentionally introduces the versioned Connector HTTP routes, HMAC
# verification, a nonce table, task leases, heartbeats, and the atomic claim.
# These are allowed — but only inside their dedicated modules, never in client
# code, never with a client-trusted owner/priority/queue argument, and never
# with a stored or browser-exposed shared secret.

# 1. The Connector shared secret must never appear in client-exposed code, as a
#    NEXT_PUBLIC_* variable, or stored in the Convex schema.
if rg -n 'NEXUS_CONNECTOR_SHARED_SECRET|NEXUS_CONNECTOR_SECRET_' \
  "$ROOT/app" "$ROOT/components" "$ROOT/convex/schema.ts" --glob '!**/*.md' 2>/dev/null; then
  echo "Boundary violation: Connector shared secret referenced in client code or schema"
  FAIL=1
fi
if rg -n 'NEXT_PUBLIC_[A-Z_]*CONNECTOR[A-Z_]*SECRET' "${SCAN_GLOBS[@]}" --glob '!**/*.md' 2>/dev/null; then
  echo "Boundary violation: Connector secret exposed as a NEXT_PUBLIC_* variable"
  FAIL=1
fi

# 2. The shared secret is read only through the canonical auth module.
if rg -l 'NEXUS_CONNECTOR_SHARED_SECRET|NEXUS_CONNECTOR_SECRET_' "$ROOT/convex" \
  --glob '!convex/lib/connectorAuth.ts' --glob '!**/*.md' --glob '!convex/_generated/**' 2>/dev/null; then
  echo "Boundary violation: Connector secret read outside convex/lib/connectorAuth.ts"
  FAIL=1
fi

# 3. The nexusConnectors table must not store a plaintext secret.
if rg -n 'sharedSecret|plaintextSecret|rawSecret' "$ROOT/convex/schema.ts" 2>/dev/null; then
  echo "Boundary violation: Connector secret field declared in schema"
  FAIL=1
fi

# 4. The browser client boundary may reference only the public Connector status
#    query — never a worker function (claim/start/complete/fail/lease/etc.).
if rg -n 'connectorTasks\.|connectorReads\.|connectorAuthStore\.|claimNextTask|completeTask|failTask|heartbeatTaskLease|startTask|acknowledgeCancellation|releaseClaim|verifyAndConsumeNonce' \
  "$ROOT/lib/nexus/p5Client.ts" 2>/dev/null; then
  echo "Boundary violation: Connector worker function referenced from the browser client boundary"
  FAIL=1
fi

# 5. Connector worker functions must be internal-only (never browser-callable).
for mod in connectorTasks connectorReads connectorAuthStore; do
  if rg -n 'export const [A-Za-z0-9_]+ = (mutation|query|action)\(' "$ROOT/convex/$mod.ts" 2>/dev/null; then
    echo "Boundary violation: public (browser-callable) function exported from convex/$mod.ts"
    FAIL=1
  fi
done

# 6. Connector-facing functions must not accept a client-trusted owner,
#    priority, or queue-sequence argument (all server-derived from the task).
CONNECTOR_INJECTION='(ownerClerkUserId|ownerId|userId|priority|queueSequence)\s*:\s*v\.'
if rg -n "$CONNECTOR_INJECTION" \
  "$ROOT/convex/connectorTasks.ts" "$ROOT/convex/connectorReads.ts" "$ROOT/convex/connectorRegistry.ts" 2>/dev/null; then
  echo "Boundary violation: Connector payload carries a trusted owner/priority/queue argument"
  FAIL=1
fi

# 7. Completion/failure must never delete task rows — tasks persist for
#    history, retries, and audit. (No second queue table consumes them.)
if rg -n 'ctx\.db\.delete\(.*nexusTasks|deleteTask' "$ROOT/convex/connectorTasks.ts" 2>/dev/null; then
  echo "Boundary violation: Connector task mutation deletes task rows"
  FAIL=1
fi

# 8. No public Connector self-registration: bootstrap is an internalMutation.
if rg -n 'export const bootstrapConnector = mutation\(' "$ROOT/convex/connectorRegistry.ts" 2>/dev/null; then
  echo "Boundary violation: public Connector self-registration endpoint"
  FAIL=1
fi

# 9. No inbound-Claudia or local-poller code belongs in Nexus runtime source
#    (P7 lives in claudia_system). Scans runtime dirs only — tests legitimately
#    assert the ABSENCE of these strings, so they are excluded.
if rg -n 'claudia_system|pollClaudia|ClaudiaPoller|fetch\(["'"'"'][^"'"'"']*claudia' \
  "$ROOT/app" "$ROOT/components" "$ROOT/lib" "$ROOT/convex" \
  --glob '!**/*.md' --glob '!convex/_generated/**' 2>/dev/null; then
  echo "Boundary violation: Claudia poller / inbound Claudia reference in Nexus runtime source"
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi

echo "Nexus boundary check passed."
