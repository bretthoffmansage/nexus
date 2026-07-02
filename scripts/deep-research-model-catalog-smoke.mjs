#!/usr/bin/env node
/**
 * Manual, read-only Deep Research model catalog smoke check.
 *
 * Fetches the Vercel AI Gateway model catalog and prints a safe summary of the
 * research-compatible models. This performs a catalog GET only — it never
 * invokes a model, never submits research, and never prints credentials or the
 * full raw response.
 *
 * Usage:
 *   node scripts/deep-research-model-catalog-smoke.mjs
 *
 * The endpoint is public; if AI_GATEWAY_API_KEY is set it is sent as a bearer
 * token to return the account-scoped catalog. The key is read here only and is
 * never printed.
 */

const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
const TOOL_CALLING_TAGS = new Set(["tool-use", "tools", "tool", "function_calling"]);
const DENIED_TYPES = new Set([
  "embedding",
  "image",
  "video",
  "reranking",
  "transcription",
  "speech",
  "realtime",
]);
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,40}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;

function isCompatible(m) {
  const id = typeof m.id === "string" ? m.id : "";
  if (!MODEL_ID_PATTERN.test(id) || /\s/.test(id)) return false;
  const type = String(m.type ?? "").toLowerCase();
  if (DENIED_TYPES.has(type)) return false;
  if (!["language", "text", "chat"].includes(type)) return false;
  const tags = Array.isArray(m.tags) ? m.tags.map((t) => String(t).toLowerCase()) : [];
  return tags.some((t) => TOOL_CALLING_TAGS.has(t));
}

async function main() {
  const headers = { accept: "application/json" };
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (key) headers.authorization = `Bearer ${key}`;

  const res = await fetch(GATEWAY_MODELS_URL, { headers });
  if (!res.ok) {
    console.error(`Catalog fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const payload = await res.json();
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const compatible = data.filter(isCompatible);

  const byProvider = {};
  for (const m of compatible) {
    const provider = String(m.id).split("/")[0];
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;
  }

  console.log("Deep Research model catalog smoke check");
  console.log("  auth:", key ? "bearer (account-scoped)" : "public (no credential)");
  console.log("  raw models:", data.length);
  console.log("  compatible models:", compatible.length);
  console.log("  by provider:", JSON.stringify(byProvider, null, 2));
  console.log(
    "  sample ids:",
    compatible.slice(0, 8).map((m) => m.id).join(", "),
  );
}

main().catch((err) => {
  console.error("Smoke check error:", err?.message ?? String(err));
  process.exit(1);
});
