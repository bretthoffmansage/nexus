import { NextResponse } from "next/server";
import {
  normalizeResearchModelCatalog,
  type NexusResearchModel,
} from "@/lib/nexus/deepResearchModelCatalog";

/**
 * Server-only Deep Research model catalog read path.
 *
 * Fetches the Vercel AI Gateway model catalog, filters to research-compatible
 * models, and returns the normalized non-secret UI list. This route ONLY reads
 * the catalog — it never invokes a model, never proxies arbitrary Gateway URLs,
 * never submits research, never calls the system, and never returns credentials.
 *
 * The Gateway `/v1/models` endpoint is public (no auth needed for the catalog),
 * but if AI_GATEWAY_API_KEY is present in the server environment it is sent as a
 * bearer token so an account-scoped catalog is returned. The credential is read
 * only here on the server and is NEVER included in the response.
 */

export const dynamic = "force-dynamic";

const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
const CACHE_TTL_MS = 5 * 60 * 1000; // bounded 5-minute cache
const FETCH_TIMEOUT_MS = 10_000;

type CatalogCache = { at: number; models: NexusResearchModel[] };
// Module-scoped cache: bounded, best-effort; survives across requests in one
// server instance. Never persisted; never keyed by user (public catalog).
let cache: CatalogCache | null = null;

function cachedResponse(models: NexusResearchModel[], cacheStatus: "fresh" | "cached" | "stale") {
  return NextResponse.json({ ok: true, models, cacheStatus });
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cachedResponse(cache.models, "cached");
  }

  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GATEWAY_MODELS_URL, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // Serve a stale cache if we have one; otherwise a bounded error.
      if (cache) return cachedResponse(cache.models, "stale");
      return NextResponse.json(
        { ok: false, error: "catalog_unavailable", models: [] },
        { status: 502 },
      );
    }
    const payload: unknown = await res.json();
    const models = normalizeResearchModelCatalog(payload);
    cache = { at: now, models };
    return cachedResponse(models, "fresh");
  } catch {
    if (cache) return cachedResponse(cache.models, "stale");
    return NextResponse.json(
      { ok: false, error: "catalog_unavailable", models: [] },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
