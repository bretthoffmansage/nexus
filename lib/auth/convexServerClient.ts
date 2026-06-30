import { ConvexHttpClient } from "convex/browser";
import { getConvexUrl } from "@/lib/env";

export type AuthenticatedConvexClientResult =
  | { ok: true; client: ConvexHttpClient }
  | { ok: false; code: "configuration_missing" | "token_missing" };

export function createAuthenticatedConvexClient(token: string | null | undefined) {
  const url = getConvexUrl();
  if (!url) {
    return { ok: false as const, code: "configuration_missing" as const };
  }

  if (!token) {
    return { ok: false as const, code: "token_missing" as const };
  }

  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return { ok: true as const, client };
}
