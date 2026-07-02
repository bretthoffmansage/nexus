import { currentUser } from "@clerk/nextjs/server";

export type ClerkDisplayNameHints = {
  clerkFirstName?: string;
  clerkUsername?: string;
};

/** Clerk session hints for display-name fallback; safe to call after auth() confirms a user. */
export async function getClerkDisplayNameHints(): Promise<ClerkDisplayNameHints> {
  const user = await currentUser();
  if (!user) return {};

  return {
    clerkFirstName: user.firstName ?? undefined,
    clerkUsername: user.username ?? undefined,
  };
}
