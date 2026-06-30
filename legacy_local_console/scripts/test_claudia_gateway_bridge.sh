#!/usr/bin/env bash
# End-to-end Claudia Gateway bridge verification (Console + Core).
# Requires Core at CLAUDIA_CORE_URL and Console at CLAUDIA_CONSOLE_URL.
#
# Auth: when AUTH_ENABLED=true, set CLAUDIA_GATEWAY_BEARER_TOKEN to an API token
# with claudia_intake and claudia_read scopes (Admin → API Tokens). The script
# does not weaken auth — it skips protected steps with a clear message if unauthenticated.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CORE_URL="${CLAUDIA_CORE_URL:-http://127.0.0.1:8080}"
CONSOLE_URL="${CLAUDIA_CONSOLE_URL:-http://127.0.0.1:7860}"
SECRET="${CLAUDIA_GATEWAY_SHARED_SECRET:-}"
BEARER="${CLAUDIA_GATEWAY_BEARER_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }
skip() { echo "○ $1"; SKIP=$((SKIP + 1)); }

json_get() {
  local expr="$1"
  python3 -c "import json,sys; data=json.load(sys.stdin); print($expr)" 2>/dev/null
}

http_code() {
  curl -sS -o /dev/null -w "%{http_code}" "$@"
}

AUTH_HEADERS=()
if [[ -n "$BEARER" ]]; then
  AUTH_HEADERS=(-H "Authorization: Bearer ${BEARER}")
fi

CORE_HEADERS=(-H "Content-Type: application/json")
if [[ -n "$SECRET" ]]; then
  CORE_HEADERS+=(-H "X-Claudia-Gateway-Secret: ${SECRET}")
fi

echo "▶ Claudia Gateway bridge verification (Console → Core)"
echo "  Core URL:     $CORE_URL"
echo "  Console URL:  $CONSOLE_URL"
echo

if [[ "$(http_code "${CORE_URL}/health")" != "200" ]]; then
  fail "Core not reachable at ${CORE_URL}/health — start claudia_system ./start-core-api.sh"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 1
fi
pass "Core is reachable"

if [[ "$(http_code "${CONSOLE_URL}/api/claudia/v1/health")" != "200" ]]; then
  skip "Console not running at ${CONSOLE_URL} — start with CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=${CORE_URL} ./start-macos.sh"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 0
fi

GW_HEALTH="$(curl -sS "${CONSOLE_URL}/api/claudia/v1/health")"
if [[ "$(printf '%s' "$GW_HEALTH" | json_get "data.get('ok', False)")" == "True" ]]; then
  pass "Console GET /api/claudia/v1/health ok=true"
else
  fail "Console health check failed"
fi

PACKET_ID="gw-bridge-$(date +%s)-$$"
TRACE_ID="trace-gw-$(date +%s)-$$"
INTAKE_BODY="$(cat <<EOF
{"packet_id":"${PACKET_ID}","trace_id":"${TRACE_ID}","type":"message","route":"bridge_e2e","payload":{"message":"Gateway packet read passthrough test"}}
EOF
)"

INTAKE_RESP="$(curl -sS -w "\n%{http_code}" -X POST "${CONSOLE_URL}/api/claudia/v1/intake" \
  "${AUTH_HEADERS[@]}" \
  -H "Content-Type: application/json" \
  -d "$INTAKE_BODY")"
INTAKE_HTTP="$(printf '%s' "$INTAKE_RESP" | tail -n1)"
INTAKE_JSON="$(printf '%s' "$INTAKE_RESP" | sed '$d')"

if [[ "$INTAKE_HTTP" == "401" || "$INTAKE_HTTP" == "403" ]]; then
  skip "Console POST /api/claudia/v1/intake returned HTTP ${INTAKE_HTTP} — set CLAUDIA_GATEWAY_BEARER_TOKEN (claudia_intake scope) or authenticate in browser"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 0
fi

INTAKE_OK="$(printf '%s' "$INTAKE_JSON" | json_get "data.get('ok', False)")"
INTAKE_FWD="$(printf '%s' "$INTAKE_JSON" | json_get "data.get('forwarded', False)")"
if [[ "$INTAKE_OK" == "True" && "$INTAKE_FWD" == "True" ]]; then
  pass "Console intake forwarded to Core"
  EXTRACTED_PID="$(printf '%s' "$INTAKE_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('packet_id') or (d.get('core') or {}).get('packet_id') or '')
" 2>/dev/null || true)"
  if [[ -n "$EXTRACTED_PID" ]]; then
    PACKET_ID="$EXTRACTED_PID"
  fi
else
  fail "Console intake did not forward successfully (HTTP ${INTAKE_HTTP}: ${INTAKE_JSON})"
fi

PACKETS_RESP="$(curl -sS -w "\n%{http_code}" "${CONSOLE_URL}/api/claudia/v1/packets" "${AUTH_HEADERS[@]}")"
PACKETS_HTTP="$(printf '%s' "$PACKETS_RESP" | tail -n1)"
PACKETS_JSON="$(printf '%s' "$PACKETS_RESP" | sed '$d')"

if [[ "$PACKETS_HTTP" == "401" || "$PACKETS_HTTP" == "403" ]]; then
  skip "Console GET /api/claudia/v1/packets returned HTTP ${PACKETS_HTTP} — token needs claudia_read scope"
elif [[ "$PACKETS_HTTP" != "200" ]]; then
  fail "Console GET /api/claudia/v1/packets returned HTTP ${PACKETS_HTTP}"
else
  FOUND="$(printf '%s' "$PACKETS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
needle=sys.argv[1]
items=d.get('packets') or d.get('items') or []
print('yes' if any(i.get('packet_id')==needle for i in items) else 'no')
" "$PACKET_ID")"
  FWD="$(printf '%s' "$PACKETS_JSON" | json_get "data.get('forwarded', False)")"
  SRC="$(printf '%s' "$PACKETS_JSON" | json_get "data.get('source', '')")"
  if [[ "$FOUND" == "yes" && "$FWD" == "True" && "$SRC" == "claudia_core" ]]; then
    pass "Console /packets lists test packet from Core (source=claudia_core)"
  else
    fail "Console /packets did not list test packet ${PACKET_ID} from Core"
  fi
fi

DETAIL_RESP="$(curl -sS -w "\n%{http_code}" "${CONSOLE_URL}/api/claudia/v1/packets/${PACKET_ID}" "${AUTH_HEADERS[@]}")"
DETAIL_HTTP="$(printf '%s' "$DETAIL_RESP" | tail -n1)"
DETAIL_JSON="$(printf '%s' "$DETAIL_RESP" | sed '$d')"

if [[ "$DETAIL_HTTP" == "401" || "$DETAIL_HTTP" == "403" ]]; then
  skip "Console GET /api/claudia/v1/packets/{id} returned HTTP ${DETAIL_HTTP} — token needs claudia_read scope"
elif [[ "$DETAIL_HTTP" != "200" ]]; then
  fail "Console GET /api/claudia/v1/packets/${PACKET_ID} returned HTTP ${DETAIL_HTTP}"
else
  MATCH="$(printf '%s' "$DETAIL_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
pkt=d.get('packet') or d.get('task') or {}
print('yes' if pkt.get('packet_id')==sys.argv[1] else 'no')
" "$PACKET_ID")"
  if [[ "$MATCH" == "yes" ]]; then
    pass "Console /packets/{packet_id} returned matching Core record"
  else
    fail "Console /packets/${PACKET_ID} did not return matching packet"
  fi
fi

if [[ -n "$SECRET" ]]; then
  if printf '%s' "$INTAKE_JSON$PACKETS_JSON$DETAIL_JSON" | grep -q "$SECRET"; then
    fail "Gateway shared secret appeared in response body"
  else
    pass "Gateway shared secret not exposed in responses"
  fi
fi

echo
echo "── Gateway message stub (Bridge 04B) ──"

MSG_BODY='{"type":"message","route":"bridge_e2e","payload":{"message":"Hello from Console Bridge 04B"}}'
MSG_RESP="$(curl -sS -w "\n%{http_code}" -X POST "${CONSOLE_URL}/api/claudia/v1/messages" \
  "${AUTH_HEADERS[@]}" \
  -H "Content-Type: application/json" \
  -d "$MSG_BODY")"
MSG_HTTP="$(printf '%s' "$MSG_RESP" | tail -n1)"
MSG_JSON="$(printf '%s' "$MSG_RESP" | sed '$d')"

if [[ "$MSG_HTTP" == "401" || "$MSG_HTTP" == "403" ]]; then
  skip "Console POST /api/claudia/v1/messages returned HTTP ${MSG_HTTP} — set CLAUDIA_GATEWAY_BEARER_TOKEN (claudia_intake scope) or authenticate"
elif [[ "$MSG_HTTP" != "200" ]]; then
  fail "Console POST /api/claudia/v1/messages returned HTTP ${MSG_HTTP}"
else
  STUB_TYPE="$(printf '%s' "$MSG_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
core=d.get('core') or {}
resp=core.get('response') or {}
print(resp.get('type') or '')
" 2>/dev/null || echo "")"
  CONTENT="$(printf '%s' "$MSG_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
core=d.get('core') or {}
resp=core.get('response') or {}
print(resp.get('content') or '')
" 2>/dev/null || echo "")"
  FWD="$(printf '%s' "$MSG_JSON" | json_get "data.get('forwarded', False)")"
  if [[ "$FWD" == "True" && "$STUB_TYPE" == "message_stub" && "$CONTENT" == *"Hello from Console Bridge 04B"* ]]; then
    pass "Console /messages returned Core message_stub with response.content"
  else
    fail "Console /messages did not return expected Core stub (HTTP ${MSG_HTTP}: ${MSG_JSON})"
  fi
fi

echo
echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
