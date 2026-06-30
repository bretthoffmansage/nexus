import { ConvexError } from "convex/values";

export const NEXUS_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  APPROVAL_REQUIRED: "approval_required",
  USER_SUSPENDED: "user_suspended",
  FORBIDDEN: "forbidden",
  ROLE_REQUIRED: "role_required",
  USER_NOT_FOUND: "user_not_found",
  ROLE_ALREADY_GRANTED: "role_already_granted",
  ROLE_NOT_ACTIVE: "role_not_active",
  LAST_ADMIN: "last_admin",
  INVALID_INPUT: "invalid_input",
} as const;

export type NexusErrorCode =
  (typeof NEXUS_ERROR_CODES)[keyof typeof NEXUS_ERROR_CODES];

export function nexusError(code: NexusErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
