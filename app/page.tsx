import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NexusShell } from "@/components/shell/NexusShell";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const clerkEnabled = isClerkConfigured();
  const convexConnected = isConvexConfigured();

  if (!clerkEnabled) {
    return (
      <NexusShell
        convexConnected={convexConnected}
        clerkEnabled={false}
        userLabel="Clerk not configured"
      />
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const label = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? userId;

  return (
    <NexusShell
      convexConnected={convexConnected}
      clerkEnabled
      userLabel={label}
    />
  );
}
