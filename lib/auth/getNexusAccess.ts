import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
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
};

export async function getNexusAccess(): Promise<NexusAccessResult> {
  if (isProductionFailClosed()) {
    return { state: "configuration_required" };
  }

  if (!isClerkConfigured() || !isConvexConfigured() || !getConvexUrl()) {
    return { state: "configuration_required" };
  }

  const session = await auth();
  if (!session.userId) {
    return { state: "unauthenticated" };
  }

  const client = await createAuthenticatedConvexClient(async () => {
    return session.getToken({ template: "convex" });
  });

  if (!client) {
    return { state: "configuration_required" };
  }

  await client.mutation(api.users.ensurePendingUser, {});

  const access = await client.query(api.users.currentUserAccess, {});

  if (access.state === "unauthenticated") {
    return { state: "unauthenticated" };
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
}
