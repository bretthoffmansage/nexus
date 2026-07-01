import { P6_SIGNING, P6_SIGNING_PREFIX } from "./p6config";

/**
 * P6 — Connector request signing/verification.
 *
 * One canonical signing contract used by every Connector protocol route.
 * Pure functions only (no `ctx.db` access) so they can run before any
 * database work — signature verification never touches the database, and a
 * bad signature never causes a wasted database round trip. Replay (nonce)
 * protection is a separate, transactional step performed by
 * `internal.connectorAuthStore.verifyAndConsumeNonce` after the signature is
 * confirmed valid.
 *
 * The shared secret is never accepted from the browser, never stored in a
 * Convex table, and never logged. It lives only in Convex deployment
 * environment configuration (`npx convex env set`), read via `process.env`.
 */

export const CONNECTOR_HEADERS = {
  connectorId: "x-nexus-connector-id",
  timestamp: "x-nexus-timestamp",
  nonce: "x-nexus-nonce",
  signature: "x-nexus-signature",
  protocolVersion: "x-nexus-protocol-version",
} as const;

const HEX_PATTERN = /^[0-9a-f]+$/i;
const CONNECTOR_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const NONCE_PATTERN = /^[A-Za-z0-9_.-]+$/;

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = "";
  for (const byte of arr) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** SHA-256 hex digest of raw request-body bytes (Web Crypto — no Node `crypto`). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(digest);
}

/**
 * Environment lookup for a Connector's shared secret. Supports one canonical
 * default Connector (`NEXUS_CONNECTOR_ID` / `NEXUS_CONNECTOR_SHARED_SECRET`)
 * plus optional additional Connectors keyed by a normalized id
 * (`NEXUS_CONNECTOR_SECRET_<NORMALIZED_ID>`). Never logged, never returned to
 * a caller, never stored in a Convex table.
 */
export function getConnectorSharedSecret(connectorId: string): string | undefined {
  const defaultId = process.env.NEXUS_CONNECTOR_ID;
  if (defaultId && defaultId === connectorId) {
    const secret = process.env.NEXUS_CONNECTOR_SHARED_SECRET;
    return secret && secret.length > 0 ? secret : undefined;
  }
  const normalized = connectorId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const secret = process.env[`NEXUS_CONNECTOR_SECRET_${normalized}`];
  return secret && secret.length > 0 ? secret : undefined;
}

export function isValidConnectorId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= P6_SIGNING.connectorIdMinLength &&
    value.length <= P6_SIGNING.connectorIdMaxLength &&
    CONNECTOR_ID_PATTERN.test(value)
  );
}

export function isValidNonce(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= P6_SIGNING.nonceMinLength &&
    value.length <= P6_SIGNING.nonceMaxLength &&
    NONCE_PATTERN.test(value)
  );
}

/** Strict integer-millisecond timestamp string, e.g. `"1735689600000"`. */
export function parseRequestTimestamp(value: string): number | null {
  if (typeof value !== "string" || !/^\d{10,15}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isWithinClockSkew(requestTimestamp: number, now: number): boolean {
  return Math.abs(now - requestTimestamp) <= P6_SIGNING.maxClockSkewMs;
}

/**
 * The one canonical signing string. Method and path are bound into the
 * signature so a valid signature for one route/verb can never be replayed
 * against another.
 */
export function buildCanonicalString(args: {
  connectorId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodySha256Hex: string;
}): string {
  return [
    P6_SIGNING_PREFIX,
    args.connectorId,
    args.timestamp,
    args.nonce,
    args.method.toUpperCase(),
    args.path,
    args.bodySha256Hex,
  ].join("\n");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Reference signer — used by tests to build fixtures, never by a verifier. */
export async function signCanonicalString(secret: string, canonical: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonical),
  );
  return bytesToHex(signatureBytes);
}

/**
 * Constant-time HMAC verification. `crypto.subtle.verify` is specified to
 * compare MACs in constant time — no manual byte-by-byte comparison needed
 * (and none should be written, to avoid an accidental timing side-channel).
 */
export async function verifyHmacSignature(
  secret: string,
  canonical: string,
  signatureHex: string,
): Promise<boolean> {
  if (signatureHex.length !== P6_SIGNING.signatureHexLength) return false;
  const signatureBytes = hexToBytes(signatureHex);
  if (!signatureBytes) return false;
  const key = await importHmacKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(canonical),
  );
}

export type ConnectorSignatureFailure =
  | "invalid_request"
  | "connector_unauthorized"
  | "stale_timestamp"
  | "invalid_signature";

export type ConnectorSignatureResult =
  | { ok: true; connectorId: string; timestamp: number; nonce: string }
  | { ok: false; code: ConnectorSignatureFailure };

/**
 * Full signature verification for one request. Pure/no DB access. Order
 * matters: cheap format checks first, then the cryptographic check, so
 * malformed requests never cause an HMAC computation.
 */
export async function verifyConnectorRequestSignature(args: {
  connectorId: string | null;
  timestampHeader: string | null;
  nonce: string | null;
  signatureHex: string | null;
  method: string;
  path: string;
  bodyBytes: Uint8Array;
  now: number;
}): Promise<ConnectorSignatureResult> {
  const { connectorId, timestampHeader, nonce, signatureHex } = args;

  if (!connectorId || !isValidConnectorId(connectorId)) {
    return { ok: false, code: "invalid_request" };
  }
  if (!nonce || !isValidNonce(nonce)) {
    return { ok: false, code: "invalid_request" };
  }
  if (!signatureHex || signatureHex.length !== P6_SIGNING.signatureHexLength || !HEX_PATTERN.test(signatureHex)) {
    return { ok: false, code: "invalid_request" };
  }
  if (!timestampHeader) {
    return { ok: false, code: "invalid_request" };
  }
  const timestamp = parseRequestTimestamp(timestampHeader);
  if (timestamp === null) {
    return { ok: false, code: "invalid_request" };
  }
  if (!isWithinClockSkew(timestamp, args.now)) {
    return { ok: false, code: "stale_timestamp" };
  }

  const secret = getConnectorSharedSecret(connectorId);
  if (!secret) {
    return { ok: false, code: "connector_unauthorized" };
  }

  const bodySha256Hex = await sha256Hex(args.bodyBytes);
  const canonical = buildCanonicalString({
    connectorId,
    timestamp: timestampHeader,
    nonce,
    method: args.method,
    path: args.path,
    bodySha256Hex,
  });

  const valid = await verifyHmacSignature(secret, canonical, signatureHex);
  if (!valid) {
    return { ok: false, code: "invalid_signature" };
  }

  return { ok: true, connectorId, timestamp, nonce };
}
