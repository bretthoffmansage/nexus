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

# No future-connector execution primitives (claims, leases, HMAC) in P5 code.
if rg -n 'claimNextTask|leaseToken|renewLease|createHmac|submitResultHmac' "$ROOT/convex" \
  --glob '!**/*.md' \
  --glob '!convex/_generated/**' 2>/dev/null; then
  echo "Boundary violation: P6 connector/claim/lease/HMAC primitive present in P5 Convex code"
  FAIL=1
fi

# Ordinary users must not enumerate the global queue: the cross-owner status
# indexes may only be referenced by the admin-gated diagnostics module.
if rg -n 'by_status_and_queue_sequence|by_queue_sequence' "$ROOT/convex/tasks.ts" \
  "$ROOT/convex/conversations.ts" "$ROOT/convex/messages.ts" 2>/dev/null; then
  echo "Boundary violation: global queue index referenced from a user-facing module"
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi

echo "Nexus boundary check passed."
