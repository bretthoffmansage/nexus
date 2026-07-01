import type { P5Test } from "./convexP5";
import { buildCanonicalString, sha256Hex, signCanonicalString } from "@/convex/lib/connectorAuth";
import { CONNECTOR_HEADERS } from "@/convex/lib/connectorAuth";

/**
 * P6 test fixtures.
 *
 * A deterministic Connector identity + shared secret. The secret is set into
 * `process.env` (see `installConnectorEnv`) because `getConnectorSharedSecret`
 * reads it from the environment exactly as it would in a real Convex
 * deployment — never from a table.
 */
export const TEST_CONNECTOR_ID = "connector-test-01";
export const TEST_CONNECTOR_SECRET = "test-shared-secret-0123456789abcdef-0123456789";

/** Point the auth layer's env lookup at the test Connector. Call in beforeEach. */
export function installConnectorEnv(): void {
  process.env.NEXUS_CONNECTOR_ID = TEST_CONNECTOR_ID;
  process.env.NEXUS_CONNECTOR_SHARED_SECRET = TEST_CONNECTOR_SECRET;
}

export function clearConnectorEnv(): void {
  delete process.env.NEXUS_CONNECTOR_ID;
  delete process.env.NEXUS_CONNECTOR_SHARED_SECRET;
}

/** Provision an active Connector row via the operator bootstrap path. */
export async function seedConnector(
  t: P5Test,
  opts?: { allowedToolIds?: string[]; connectorId?: string },
): Promise<void> {
  const { internal } = await import("@/convex/_generated/api");
  await t.mutation(internal.connectorRegistry.bootstrapConnector, {
    connectorId: opts?.connectorId ?? TEST_CONNECTOR_ID,
    displayName: "Test Connector",
    allowedToolIds: opts?.allowedToolIds,
  });
}

let nonceCounter = 0;

/** A unique, well-formed nonce for a signed request. */
export function freshNonce(): string {
  nonceCounter += 1;
  return `nonce-${Date.now().toString(36)}-${nonceCounter.toString().padStart(6, "0")}-abcdef`;
}

export type SignedRequestOptions = {
  connectorId?: string;
  secret?: string;
  method?: string;
  path: string;
  body?: unknown;
  timestamp?: number;
  nonce?: string;
  /** Tamper hooks for negative tests. */
  overrideSignature?: string;
  overridePathForSigning?: string;
  overrideMethodForSigning?: string;
  overrideBodyForSigning?: string;
};

/** Build headers + body for a signed Connector request. */
export async function buildSignedRequest(opts: SignedRequestOptions): Promise<{
  path: string;
  init: RequestInit;
}> {
  const connectorId = opts.connectorId ?? TEST_CONNECTOR_ID;
  const secret = opts.secret ?? TEST_CONNECTOR_SECRET;
  const method = opts.method ?? "POST";
  const timestamp = String(opts.timestamp ?? Date.now());
  const nonce = opts.nonce ?? freshNonce();
  const bodyString = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const bodyBytes = new TextEncoder().encode(bodyString);
  const bodyHash = await sha256Hex(bodyBytes);

  const canonical = buildCanonicalString({
    connectorId,
    timestamp,
    nonce,
    method: opts.overrideMethodForSigning ?? method,
    path: opts.overridePathForSigning ?? opts.path,
    bodySha256Hex: opts.overrideBodyForSigning ?? bodyHash,
  });
  const signature = opts.overrideSignature ?? (await signCanonicalString(secret, canonical));

  return {
    path: opts.path,
    init: {
      method,
      headers: {
        "content-type": "application/json",
        [CONNECTOR_HEADERS.connectorId]: connectorId,
        [CONNECTOR_HEADERS.timestamp]: timestamp,
        [CONNECTOR_HEADERS.nonce]: nonce,
        [CONNECTOR_HEADERS.signature]: signature,
        [CONNECTOR_HEADERS.protocolVersion]: "v1",
      },
      body: bodyString,
    },
  };
}

/** Convenience: sign and fire a request through convex-test's HTTP router. */
export async function fetchSigned(t: P5Test, opts: SignedRequestOptions): Promise<Response> {
  const { path, init } = await buildSignedRequest(opts);
  return t.fetch(path, init);
}
