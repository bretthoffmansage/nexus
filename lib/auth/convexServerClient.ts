import { ConvexHttpClient } from "convex/browser";
import { getConvexUrl } from "@/lib/env";

export async function createAuthenticatedConvexClient(getToken: () => Promise<string | null>) {
  const url = getConvexUrl();
  if (!url) return null;

  const client = new ConvexHttpClient(url);
  const token = await getToken();
  if (token) {
    client.setAuth(token);
  }
  return client;
}
