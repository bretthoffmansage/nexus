#!/usr/bin/env bash
# Bridge 08 — Nexus Gateway CLI Mirror relay smoke test (Console → Core PTY).
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CORE_URL="${NEXUS_CORE_URL:-http://127.0.0.1:8080}"
CONSOLE_URL="${NEXUS_CONSOLE_URL:-http://127.0.0.1:7860}"
SECRET="${NEXUS_GATEWAY_SHARED_SECRET:-}"
BEARER="${NEXUS_GATEWAY_BEARER_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }
skip() { echo "○ $1"; SKIP=$((SKIP + 1)); }

json_get() {
  python3 -c "import json,sys; data=json.load(sys.stdin); print($1)" 2>/dev/null
}

CURL_AUTH=()
if [[ -n "$BEARER" ]]; then
  CURL_AUTH=(-H "Authorization: Bearer ${BEARER}")
fi

echo "▶ Bridge 08 CLI Gateway relay smoke test"
echo "  Core:    $CORE_URL"
echo "  Console: $CONSOLE_URL"
echo

if [[ "$(curl -sS -o /dev/null -w '%{http_code}' "${CORE_URL}/health")" != "200" ]]; then
  fail "Core not reachable — start with NEXUS_ENABLE_HERMES_PTY=true ./start-core-api.sh"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 1
fi
pass "Core reachable"

if [[ "$(curl -sS -o /dev/null -w '%{http_code}' "${CONSOLE_URL}/api/nexus/v1/health")" != "200" ]]; then
  skip "Console not running — start with NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=${CORE_URL} ./start-macos.sh"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 0
fi
pass "Console reachable"

START_RESP="$(curl -sS -w "\n%{http_code}" -X POST "${CURL_AUTH[@]}" \
  -H "Content-Type: application/json" \
  "${CONSOLE_URL}/api/nexus/v1/cli/sessions" \
  -d '{"title":"Bridge 08 CLI relay test"}')"
START_HTTP="$(printf '%s' "$START_RESP" | tail -n1)"
START_JSON="$(printf '%s' "$START_RESP" | sed '$d')"

if [[ "$START_HTTP" == "401" || "$START_HTTP" == "403" ]]; then
  skip "CLI session start returned HTTP ${START_HTTP} — set NEXUS_GATEWAY_BEARER_TOKEN with nexus_admin scope or authenticate as admin"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 0
fi

if [[ "$START_HTTP" != "200" ]]; then
  fail "POST /api/nexus/v1/cli/sessions returned HTTP ${START_HTTP}: ${START_JSON}"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 1
fi
pass "CLI session started via Gateway"

SESSION_ID="$(printf '%s' "$START_JSON" | json_get "data.get('session_id') or data.get('core',{}).get('session_id') or ''")"
if [[ -z "$SESSION_ID" ]]; then
  fail "No session_id in Gateway start response"
  echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
  exit 1
fi

INPUT_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${CURL_AUTH[@]}" \
  -H "Content-Type: application/json" \
  "${CONSOLE_URL}/api/nexus/v1/cli/sessions/${SESSION_ID}/input" \
  -d '{"text":"/help"}')"
if [[ "$INPUT_HTTP" == "200" ]]; then
  pass "CLI input forwarded via Gateway"
else
  fail "CLI input returned HTTP ${INPUT_HTTP}"
fi

sleep 2
TRANSCRIPT="$(curl -sS "${CURL_AUTH[@]}" "${CONSOLE_URL}/api/nexus/v1/cli/sessions/${SESSION_ID}/transcript")"
if printf '%s' "$TRANSCRIPT" | grep -q '"events"'; then
  pass "CLI transcript returned via Gateway"
else
  fail "CLI transcript missing events"
fi

STREAM_SAMPLE="$(curl -sS -N --max-time 3 "${CURL_AUTH[@]}" \
  "${CONSOLE_URL}/api/nexus/v1/cli/sessions/${SESSION_ID}/stream" 2>/dev/null | head -c 800 || true)"
if printf '%s' "$STREAM_SAMPLE" | grep -Eq 'event:|data:'; then
  pass "CLI stream relay returned SSE"
else
  fail "CLI stream did not return SSE (sample: ${STREAM_SAMPLE})"
fi

STOP_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${CURL_AUTH[@]}" \
  "${CONSOLE_URL}/api/nexus/v1/cli/sessions/${SESSION_ID}/stop")"
if [[ "$STOP_HTTP" == "200" ]]; then
  pass "CLI stop forwarded via Gateway"
else
  fail "CLI stop returned HTTP ${STOP_HTTP}"
fi

if [[ -n "$SECRET" ]]; then
  if printf '%s' "$START_JSON$TRANSCRIPT$STREAM_SAMPLE" | grep -q "$SECRET"; then
    fail "Gateway shared secret appeared in CLI relay responses"
  else
    pass "Gateway shared secret not exposed in CLI relay responses"
  fi
fi

echo
echo "Result: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
exit $([[ "$FAIL" -eq 0 ]] && echo 0 || echo 1)
