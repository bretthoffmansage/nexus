import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { nexusClerkAppearance } from "@/lib/auth/clerkAppearance";

type AppProvidersProps = {
  children: React.ReactNode;
  clerkPublishableKey?: string;
  convexUrl?: string;
};

export function AppProviders({
  children,
  clerkPublishableKey,
  convexUrl,
}: AppProvidersProps) {
  const inner = (
    <ThemeProvider>
      <ConvexClientProvider convexUrl={convexUrl} clerkEnabled={Boolean(clerkPublishableKey)}>
        {children}
      </ConvexClientProvider>
    </ThemeProvider>
  );

  if (!clerkPublishableKey) {
    return inner;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      appearance={nexusClerkAppearance}
    >
      {inner}
    </ClerkProvider>
  );
}
