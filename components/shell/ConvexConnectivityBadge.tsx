"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function ConvexConnectivityBadge() {
  const appMeta = useQuery(api.appMeta.get, {});

  return (
    <p className="nexus-convex-badge">
      Convex: {appMeta === undefined ? "connecting…" : appMeta?.productName ?? "unavailable"}
      {appMeta?.environment ? ` · ${appMeta.environment}` : ""}
    </p>
  );
}
