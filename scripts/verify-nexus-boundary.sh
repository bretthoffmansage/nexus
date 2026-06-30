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

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi

echo "Nexus boundary check passed."
