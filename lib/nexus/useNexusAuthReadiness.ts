"use client";

import { useConvexAuth } from "convex/react";

/**
 * P5.1 — single readiness source for every P5 private (owner-scoped) Convex
 * query and mutation.
 *
 * Clerk reporting a signed-in user and Convex confirming an auth token are
 * NOT the same moment: Clerk's client state can be "signed in" before the
 * Convex WebSocket has finished exchanging and validating the session token.
 * Issuing an owner-scoped query in that gap causes the backend's (correct)
 * `unauthenticated` rejection. `readyForPrivateQueries` is the only signal
 * components should use to decide whether to run a protected query/mutation.
 * It also drops during Convex token refresh (`isRefreshing`) so queries are
 * not issued while the client is between tokens.
 *
 * Wraps Convex's own `useConvexAuth()` — the authoritative signal for whether
 * the Convex client currently has a confirmed auth token. Convex remains the
 * sole authentication authority; this hook adds no separate readiness state
 * of its own. Like the sibling `useQuery`/`useMutation` calls already used
 * throughout the P5 components, this requires a `ConvexProviderWithAuth`-
 * family provider (e.g. `ConvexProviderWithClerk`) above it in the tree,
 * which every page that renders these components mounts.
 */
export type NexusAuthReadiness = {
  /** Convex is still resolving the current auth token. */
  isLoading: boolean;
  /** Convex has confirmed the current token belongs to a signed-in user. */
  isAuthenticated: boolean;
  /** Convex is refreshing the auth token for a signed-in user. */
  isRefreshing: boolean;
  /** Safe to issue a P5/P6 private query/mutation right now. */
  readyForPrivateQueries: boolean;
};

const NOT_READY: NexusAuthReadiness = {
  isLoading: false,
  isAuthenticated: false,
  isRefreshing: false,
  readyForPrivateQueries: false,
};

export function useNexusAuthReadiness(): NexusAuthReadiness {
  // `useConvexAuth()` throws when no `ConvexProviderWithClerk`-family provider
  // is mounted above it — a reachable state for shell components (rendered on
  // every route) in the dev-only "configuration required" render, or when
  // Clerk is unconfigured so only a plain `ConvexProvider` exists. Treat that
  // as "not ready" rather than crashing the whole shell. The hook is still
  // invoked unconditionally (first statement in the try), so hook order is
  // stable across renders.
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- always invoked; the catch only degrades a provider-less render to "not ready".
    const { isLoading, isAuthenticated, isRefreshing } = useConvexAuth();
    return {
      isLoading,
      isAuthenticated,
      isRefreshing,
      readyForPrivateQueries: !isLoading && isAuthenticated && !isRefreshing,
    };
  } catch {
    return NOT_READY;
  }
}
