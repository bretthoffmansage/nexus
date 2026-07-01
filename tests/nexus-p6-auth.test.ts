// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCanonicalString,
  signCanonicalString,
  verifyHmacSignature,
} from "@/convex/lib/connectorAuth";
import { p5Test } from "./helpers/convexP5";
import {
  buildSignedRequest,
  clearConnectorEnv,
  fetchSigned,
  freshNonce,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
  TEST_CONNECTOR_SECRET,
} from "./helpers/convexP6";

const HEARTBEAT = "/api/connector/v1/heartbeat";

async function json(res: Response): Promise<{ ok: boolean; error?: { code: string }; data?: unknown }> {
  return (await res.json()) as { ok: boolean; error?: { code: string }; data?: unknown };
}

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

describe("P6 signing primitives (deterministic)", () => {
  it("round-trips an HMAC signature and rejects a tampered canonical string", async () => {
    const canonical = buildCanonicalString({
      connectorId: "c1",
      timestamp: "1735689600000",
      nonce: "nonce-abc-123456",
      method: "POST",
      path: "/api/connector/v1/claim",
      bodySha256Hex: "a".repeat(64),
    });
    const sig = await signCanonicalString(TEST_CONNECTOR_SECRET, canonical);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyHmacSignature(TEST_CONNECTOR_SECRET, canonical, sig)).toBe(true);
    expect(await verifyHmacSignature(TEST_CONNECTOR_SECRET, canonical + "x", sig)).toBe(false);
    expect(await verifyHmacSignature("wrong-secret", canonical, sig)).toBe(false);
  });
});

describe("P6 Connector HTTP authentication (Part W)", () => {
  it("1. accepts a valid signed heartbeat", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, { path: HEARTBEAT, body: { operatingState: "idle" } });
    expect(res.status).toBe(200);
    const parsed = await json(res);
    expect(parsed.ok).toBe(true);
    expect((parsed.data as { status: string }).status).toBe("active");
  });

  it("2 & 12. rejects an invalid / malformed signature", async () => {
    const t = p5Test();
    await seedConnector(t);
    const bad = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      overrideSignature: "f".repeat(64),
    });
    expect((await json(bad)).error?.code).toBe("invalid_signature");

    const malformed = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      overrideSignature: "not-hex",
    });
    expect((await json(malformed)).ok).toBe(false);
  });

  it("3. rejects an unknown Connector id (no secret configured)", async () => {
    const t = p5Test();
    await seedConnector(t);
    // Signed with a connectorId that has no env secret.
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      connectorId: "connector-unknown",
      secret: TEST_CONNECTOR_SECRET,
    });
    expect((await json(res)).error?.code).toBe("connector_unauthorized");
  });

  it("4. rejects a disabled Connector (valid signature, but disabled in DB)", async () => {
    const t = p5Test();
    await seedConnector(t);
    const { internal } = await import("@/convex/_generated/api");
    await t.mutation(internal.connectorRegistry.setConnectorStatus, {
      connectorId: TEST_CONNECTOR_ID,
      status: "disabled",
    });
    const res = await fetchSigned(t, { path: HEARTBEAT, body: {} });
    expect((await json(res)).error?.code).toBe("connector_disabled");
  });

  it("5. rejects a revoked Connector", async () => {
    const t = p5Test();
    await seedConnector(t);
    const { internal } = await import("@/convex/_generated/api");
    await t.mutation(internal.connectorRegistry.setConnectorStatus, {
      connectorId: TEST_CONNECTOR_ID,
      status: "revoked",
    });
    const res = await fetchSigned(t, { path: HEARTBEAT, body: {} });
    expect((await json(res)).error?.code).toBe("connector_revoked");
  });

  it("6 & 7. rejects stale and far-future timestamps", async () => {
    const t = p5Test();
    await seedConnector(t);
    const stale = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      timestamp: Date.now() - 10 * 60 * 1000,
    });
    expect((await json(stale)).error?.code).toBe("stale_timestamp");

    const future = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      timestamp: Date.now() + 10 * 60 * 1000,
    });
    expect((await json(future)).error?.code).toBe("stale_timestamp");
  });

  it("8. rejects a reused nonce (replay)", async () => {
    const t = p5Test();
    await seedConnector(t);
    const nonce = freshNonce();
    const first = await fetchSigned(t, { path: HEARTBEAT, body: {}, nonce });
    expect(first.status).toBe(200);
    // Re-sign a fresh request but reuse the same nonce.
    const replay = await fetchSigned(t, { path: HEARTBEAT, body: {}, nonce });
    expect((await json(replay)).error?.code).toBe("replay_detected");
  });

  it("9. rejects a modified body (signature bound to body hash)", async () => {
    const t = p5Test();
    await seedConnector(t);
    const { path, init } = await buildSignedRequest({ path: HEARTBEAT, body: { operatingState: "idle" } });
    init.body = JSON.stringify({ operatingState: "running" }); // tamper after signing
    const res = await t.fetch(path, init);
    expect((await json(res)).error?.code).toBe("invalid_signature");
  });

  it("10. rejects a request signed for a different route", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      overridePathForSigning: "/api/connector/v1/claim",
    });
    expect((await json(res)).error?.code).toBe("invalid_signature");
  });

  it("11. rejects a request signed for a different method", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: {},
      overrideMethodForSigning: "GET",
    });
    expect((await json(res)).error?.code).toBe("invalid_signature");
  });

  it("13. rejects an oversized body before doing crypto work", async () => {
    const t = p5Test();
    await seedConnector(t);
    const huge = { blob: "x".repeat(70 * 1024) };
    const res = await fetchSigned(t, { path: HEARTBEAT, body: huge });
    expect((await json(res)).error?.code).toBe("body_too_large");
  });

  it("14 & 15. never returns or echoes the shared secret", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, { path: HEARTBEAT, body: {} });
    const text = JSON.stringify(await json(res));
    expect(text).not.toContain(TEST_CONNECTOR_SECRET);
  });

  it("16. surfaces only stable error codes, never a raw stack trace", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, { path: HEARTBEAT, body: {}, overrideSignature: "f".repeat(64) });
    const parsed = await json(res);
    const serialized = JSON.stringify(parsed);
    expect(parsed.error?.code).toBe("invalid_signature");
    expect(serialized).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack frames
    expect(serialized).not.toContain("ConvexError");
  });
});
