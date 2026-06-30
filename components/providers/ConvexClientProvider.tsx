"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo } from "react";

type ConvexClientProviderProps = {
  children: React.ReactNode;
  convexUrl?: string;
};

export function ConvexClientProvider({ children, convexUrl }: ConvexClientProviderProps) {
  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
