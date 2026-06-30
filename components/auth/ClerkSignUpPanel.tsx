"use client";

import { SignUp } from "@clerk/nextjs";
import { nexusClerkAppearance } from "@/lib/auth/clerkAppearance";

export function ClerkSignUpPanel() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl="/"
      fallbackRedirectUrl="/"
      appearance={nexusClerkAppearance}
    />
  );
}
