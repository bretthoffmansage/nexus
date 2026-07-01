#!/usr/bin/env bash
# Report Nexus env variable presence without printing secret values.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env.local"

check_var() {
  local name="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "$name=missing (.env.local absent)"
    return
  fi
  if grep -q "^${name}=" "$ENV_FILE"; then
    local value
    value="$(grep "^${name}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
    if [[ -z "${value// }" ]]; then
      echo "$name=empty"
    elif [[ "$value" == *your_* ]] || [[ "$value" == *placeholder* ]] || [[ "$value" == *changeme* ]]; then
      echo "$name=placeholder"
    else
      echo "$name=present"
    fi
  else
    echo "$name=missing"
  fi
}

for name in \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
  CLERK_SECRET_KEY \
  CLERK_FRONTEND_API_URL \
  NEXT_PUBLIC_CLERK_SIGN_IN_URL \
  NEXT_PUBLIC_CLERK_SIGN_UP_URL \
  NEXT_PUBLIC_CONVEX_URL \
  CLERK_WEBHOOK_SECRET \
  CLERK_JWT_ISSUER_DOMAIN \
  NEXUS_INTERNAL_API_SECRET \
  NEXUS_BOOTSTRAP_ADMIN_EMAILS; do
  check_var "$name"
done

# --- P6 trusted Connector protocol (presence-only) -------------------------
# These belong in the CONVEX deployment environment (`npx convex env set ...`),
# not necessarily .env.local — Convex functions read them via process.env. They
# are optional until a Connector is provisioned, so "missing" is not a failure;
# this only reports presence. Secret values are never printed.
echo "# P6 connector (set in Convex deployment env; optional until a Connector exists):"
check_var "NEXUS_CONNECTOR_ID"

# The shared secret: presence + minimum-strength only (never its value).
check_connector_secret() {
  local name="NEXUS_CONNECTOR_SHARED_SECRET"
  if [[ ! -f "$ENV_FILE" ]] || ! grep -q "^${name}=" "$ENV_FILE"; then
    echo "$name=missing (.env.local; may instead be set in Convex deployment env)"
    return
  fi
  local value
  value="$(grep "^${name}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  if [[ -z "${value// }" ]]; then
    echo "$name=empty"
  elif [[ "${#value}" -lt 32 ]]; then
    echo "$name=present (weak: use >= 32 random chars)"
  else
    echo "$name=present"
  fi
}
check_connector_secret
