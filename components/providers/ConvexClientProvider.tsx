"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useMemo } from "react";

type ConvexClientProviderProps = {
  children: React.ReactNode;
  convexUrl?: string;
  clerkEnabled: boolean;
};

export function ConvexClientProvider({
  children,
  convexUrl,
  clerkEnabled,
}: ConvexClientProviderProps) {
  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!client) {
    return <>{children}</>;
  }

  if (!clerkEnabled) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
