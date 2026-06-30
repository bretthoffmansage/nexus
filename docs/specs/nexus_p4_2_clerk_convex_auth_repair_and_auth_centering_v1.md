# Nexus P4.2 — Clerk-to-Convex Auth Repair and Auth Card Centering (v1)

**Package:** P4.2 corrective identity bridge + login layout
**Status:** Complete
**Date:** 2026-06-30

## Observed runtime error

After successful Clerk Google sign-in, redirect to `/` threw:

```
Runtime ClerkAPIResponseError: Not Found
lib/auth/convexServerClient.ts → session.getToken({ template: "convex" })
```

## Root cause

`getNexusAccess()` called `session.getToken({ template: "convex" })`, which asks Clerk Backend API to mint a **legacy JWT template** token. With Clerk’s **native Convex integration** enabled (`aud: "convex"` on the normal session token), that template endpoint returns **404 Not Found** because no separate `convex` JWT template exists.

Convex’s own `ConvexProviderWithClerk` already handles this correctly: when `sessionClaims.aud === "convex"`, it calls `getToken()` **without** a template.

## Corrected token flow

1. `await auth()` on the server (Next.js App Router).
2. `getClerkConvexSessionToken()` mirrors `ConvexProviderWithClerk`:
   - native integration → `getToken()` (session token with `aud: "convex"`);
   - legacy fallback → `getToken({ template: "convex" })`.
3. Token passed to `ConvexHttpClient.setAuth(token)`.
4. Convex validates against `convex/auth.config.ts` (`applicationID: "convex"`).

## Token type

**Native Clerk session token** (not a legacy JWT template) when native Convex integration is active.

## Convex auth configuration

`convex/auth.config.ts` now prefers **`CLERK_FRONTEND_API_URL`** (canonical for native integration) with **`CLERK_JWT_ISSUER_DOMAIN`** as compatibility alias. If both are set and differ, Convex uses the Frontend API URL and logs a warning (local `assessClerkInstanceConsistency()` reports `issuerConflict`).

## Error-state behavior

New access states:

- `identity_service_unavailable` — Clerk session exists but token retrieval failed.
- `convex_authentication_failed` — token obtained but Convex rejected identity or access lookup failed.

Routed to `/auth-service-error` with safe messaging (diagnostic code in development only). Does **not** downgrade to pending or unauthenticated when Clerk session is present.

## Auth layout

**Before:** two-column grid placed the Clerk card in the right column.
**After:** `nexus-auth-stage` is `position: absolute; inset: 0; display: grid; place-items: center` — card centered at viewport center. Left aside is absolutely positioned and does not affect card placement.

## Bootstrap

Unchanged Convex authority: `ensurePendingUser` uses verified JWT identity email for `NEXUS_BOOTSTRAP_ADMIN_EMAILS` comparison. Operator must complete first login with bootstrap email in the Clerk session claims.

## Username completion

Clerk may require username after Google OAuth depending on dashboard settings. This is expected Clerk behavior and does not block the token fix.

## Tests

`tests/nexus-p4-2-clerk-convex-auth.test.ts` — token contract, failure handling, auth config, centering layout, routing.

## Validation results

| Command | Result |
|---------|--------|
| `npx convex codegen` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS (56 tests) |
| `npm run build` | PASS |
| `./scripts/verify-nexus-boundary.sh` | PASS |
| `./scripts/check-nexus-env.sh` | PASS (`CLERK_WEBHOOK_SECRET=missing` expected) |
| `clerk doctor` | Not completed in agent shell |

## Manual smoke test

- `/sign-in` returns HTTP 200 with `nexus-auth-stage`, `nexus-auth-aside`, and embedded Clerk panel shell.
- Full Google OAuth + redirect requires operator browser session (not automated here).

## Remaining before P5

1. Operator re-test Google sign-in → `/` after this package.
2. Confirm bootstrap admin receives roles in Convex.
3. Configure `CLERK_WEBHOOK_SECRET` when a public domain exists.
4. Replace historical Git remote before deployment.

## Exact next step

Operator verifies signed-in redirect to Nexus shell and `/admin/access`, then begin **P5 — task persistence**.
