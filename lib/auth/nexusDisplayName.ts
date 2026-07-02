export type NexusDisplayNameInput = {
  /** Nexus profile display name from Convex approvedUsers. */
  displayName?: string | null;
  clerkFirstName?: string | null;
  clerkUsername?: string | null;
  primaryEmail?: string | null;
};

/** Neutral placeholder while server identity is not yet available. */
export const SIDEBAR_IDENTITY_LOADING_LABEL = "Nexus";

/**
 * Resolve the signed-in user's visible display name for sidebar identity and chips.
 * Does not expose Clerk IDs or full email when a safer name exists.
 */
export function resolveNexusDisplayName(input: NexusDisplayNameInput): string {
  const profileName = input.displayName?.trim();
  if (profileName) return profileName;

  const firstName = input.clerkFirstName?.trim();
  if (firstName) return firstName;

  const username = input.clerkUsername?.trim();
  if (username) return username;

  const email = input.primaryEmail?.trim();
  if (email) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) return localPart;
  }

  return "User";
}
