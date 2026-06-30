import { auth } from "@clerk/nextjs/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { getClerkConvexSessionToken } from "@/lib/auth/clerkConvexToken";
import { createAuthenticatedConvexClient } from "@/lib/auth/convexServerClient";
import {
  getConvexUrl,
  isClerkConfigured,
  isConvexConfigured,
  isProductionFailClosed,
} from "@/lib/env";
import type { NexusRole } from "@/lib/auth/permissions";

export type NexusAccessState =
  | "unauthenticated"
  | "configuration_required"
  | "identity_service_unavailable"
  | "convex_authentication_failed"
  | "identity_claims_incomplete"
  | "pending"
  | "suspended"
  | "approved_without_role"
  | "approved";

export type NexusAccessResult = {
  state: NexusAccessState;
  clerkUserId?: string;
  primaryEmail?: string;
  displayName?: string;
  roles?: NexusRole[];
  errorCode?: string;
};

function identityServiceError(code: string, clerkUserId?: string): NexusAccessResult {
  return {
    state: "identity_service_unavailable",
    clerkUserId,
    errorCode: code,
  };
}

function convexAuthError(code: string, clerkUserId?: string): NexusAccessResult {
  return {
    state: "convex_authentication_failed",
    clerkUserId,
    errorCode: code,
  };
}

export async function getNexusAccess(): Promise<NexusAccessResult> {
  if (isProductionFailClosed()) {
    return { state: "configuration_required", errorCode: "production_not_configured" };
  }

  if (!isClerkConfigured() || !isConvexConfigured() || !getConvexUrl()) {
    return { state: "configuration_required", errorCode: "integration_not_configured" };
  }

  const session = await auth();
  if (!session.userId) {
    return { state: "unauthenticated" };
  }

  const tokenResult = await getClerkConvexSessionToken(session);
  if (!tokenResult.ok) {
    if (tokenResult.code === "not_signed_in") {
      return { state: "unauthenticated" };
    }
    return identityServiceError(tokenResult.code, session.userId);
  }

  const clientResult = createAuthenticatedConvexClient(tokenResult.token);
  if (!clientResult.ok) {
    return clientResult.code === "configuration_missing"
      ? { state: "configuration_required", errorCode: "convex_url_missing" }
      : identityServiceError("token_missing", session.userId);
  }

  const client = clientResult.client;

  try {
    const ensureResult = await client.mutation(api.users.ensurePendingUser, {});
    if (ensureResult.status === "identity_claims_incomplete") {
      return {
        state: "identity_claims_incomplete",
        clerkUserId: session.userId,
      };
    }

    const access = await client.query(api.users.currentUserAccess, {});

    if (access.state === "unauthenticated") {
      return convexAuthError("convex_identity_missing", session.userId);
    }

    if (access.state === "identity_claims_incomplete") {
      return {
        state: "identity_claims_incomplete",
        clerkUserId: access.clerkUserId ?? session.userId,
      };
    }

    if (access.state === "pending") {
      return {
        state: "pending",
        clerkUserId: access.clerkUserId,
        primaryEmail: access.primaryEmail,
      };
    }

    if (access.state === "suspended") {
      return {
        state: "suspended",
        clerkUserId: access.clerkUserId,
      };
    }

    if (access.state === "approved_without_role") {
      return {
        state: "approved_without_role",
        clerkUserId: access.clerkUserId,
        primaryEmail: access.primaryEmail,
      };
    }

    return {
      state: "approved",
      clerkUserId: access.clerkUserId,
      primaryEmail: access.primaryEmail,
      displayName: access.displayName,
      roles: access.roles,
    };
  } catch (error) {
    if (error instanceof ConvexError) {
      const data = error.data as { code?: string } | undefined;
      if (data?.code === "unauthenticated") {
        return convexAuthError("convex_rejected_token", session.userId);
      }
    }
    return convexAuthError("convex_access_lookup_failed", session.userId);
  }
}
