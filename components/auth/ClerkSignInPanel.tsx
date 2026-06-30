"use client";

import { SignIn } from "@clerk/nextjs";
import { nexusClerkAppearance } from "@/lib/auth/clerkAppearance";

export function ClerkSignInPanel() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      forceRedirectUrl="/"
      fallbackRedirectUrl="/"
      appearance={nexusClerkAppearance}
    />
  );
}
