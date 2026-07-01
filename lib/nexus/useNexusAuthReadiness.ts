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
  /** Safe to issue a P5 private query/mutation right now. */
  readyForPrivateQueries: boolean;
};

export function useNexusAuthReadiness(): NexusAuthReadiness {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return {
    isLoading,
    isAuthenticated,
    readyForPrivateQueries: !isLoading && isAuthenticated,
  };
}
