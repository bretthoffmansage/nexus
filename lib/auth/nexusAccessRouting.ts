import type { NexusAccessResult } from "@/lib/auth/getNexusAccess";

export function nexusAccessRedirectPath(access: NexusAccessResult): string | null {
  switch (access.state) {
    case "unauthenticated":
      return "/sign-in";
    case "configuration_required":
      return "/configuration-required";
    case "identity_service_unavailable":
    case "convex_authentication_failed":
      return `/auth-service-error?code=${encodeURIComponent(access.errorCode ?? access.state)}`;
    case "pending":
    case "approved_without_role":
      return "/pending-approval";
    case "suspended":
      return "/access-suspended";
    default:
      return null;
  }
}
