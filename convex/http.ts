import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { NEXUS_ERROR_CODES } from "./lib/errors";
import { P6_LIMITS, P6_PROTOCOL_VERSION } from "./lib/p6config";
import {
  CONNECTOR_HEADERS,
  verifyConnectorRequestSignature,
} from "./lib/connectorAuth";

/**
 * P6 — trusted Connector HTTP protocol (the ONLY externally reachable P6
 * surface).
 *
 * Flow for every request: read raw body bytes → verify the HMAC signature
 * (pure, no DB) → consume the replay nonce (transactional) → dispatch to a
 * single, specific internal Convex mutation with only the fields that action
 * needs. There is no generic "run any function" endpoint: the task endpoint
 * dispatches on a fixed `action` enum, each mapped to one internal mutation
 * with an explicit, per-action argument projection. The browser can never
 * reach these mutations (they are `internalMutation`), and the shared secret
 * is read only from Convex environment config, never stored or returned.
 */

const HTTP_STATUS_BY_CODE: Record<string, number> = {
  [NEXUS_ERROR_CODES.CONNECTOR_UNAUTHORIZED]: 401,
  [NEXUS_ERROR_CODES.INVALID_SIGNATURE]: 401,
  [NEXUS_ERROR_CODES.CONNECTOR_DISABLED]: 403,
  [NEXUS_ERROR_CODES.CONNECTOR_REVOKED]: 403,
  [NEXUS_ERROR_CODES.STALE_TIMESTAMP]: 401,
  [NEXUS_ERROR_CODES.REPLAY_DETECTED]: 409,
  [NEXUS_ERROR_CODES.INVALID_REQUEST]: 400,
  [NEXUS_ERROR_CODES.BODY_TOO_LARGE]: 413,
  [NEXUS_ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED]: 400,
  [NEXUS_ERROR_CODES.CONNECTOR_BUSY]: 409,
  [NEXUS_ERROR_CODES.TASK_NOT_FOUND]: 404,
  [NEXUS_ERROR_CODES.TASK_NOT_CLAIMED]: 409,
  [NEXUS_ERROR_CODES.WRONG_CONNECTOR]: 403,
  [NEXUS_ERROR_CODES.WRONG_LEASE]: 409,
  [NEXUS_ERROR_CODES.LEASE_EXPIRED]: 409,
  [NEXUS_ERROR_CODES.INVALID_TASK_STATE]: 409,
  [NEXUS_ERROR_CODES.CANCELLATION_REQUESTED]: 409,
  [NEXUS_ERROR_CODES.COMPLETION_CONFLICT]: 409,
  [NEXUS_ERROR_CODES.RESULT_TOO_LARGE]: 413,
  [NEXUS_ERROR_CODES.TOO_MANY_SOURCES]: 400,
  [NEXUS_ERROR_CODES.PROGRESS_TOO_LARGE]: 413,
  [NEXUS_ERROR_CODES.INTERNAL_ERROR]: 500,
};

function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

function okResponse(data: unknown, requestId: string): Response {
  return new Response(
    JSON.stringify({ ok: true, requestId, protocolVersion: P6_PROTOCOL_VERSION, data }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function errorResponse(code: string, message: string, requestId: string): Response {
  const status = HTTP_STATUS_BY_CODE[code] ?? 400;
  return new Response(
    JSON.stringify({ ok: false, requestId, protocolVersion: P6_PROTOCOL_VERSION, error: { code, message } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/** Extract a stable {code,message} from a thrown ConvexError; otherwise
 * collapse to a generic internal_error (never leak a raw stack/message). */
function toStableError(error: unknown): { code: string; message: string } {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | undefined;
    if (data && typeof data.code === "string") {
      return { code: data.code, message: typeof data.message === "string" ? data.message : "Request failed" };
    }
  }
  return { code: NEXUS_ERROR_CODES.INTERNAL_ERROR, message: "Internal error" };
}

type VerifiedRequest =
  | { ok: true; connectorId: string; payload: Record<string, unknown> }
  | { ok: false; code: string; message: string };

/** Shared: size-check, signature-verify, nonce-consume, JSON-parse. Returns
 * the authenticated connectorId and parsed body, or a stable error. */
async function authenticate(ctx: ActionCtx, request: Request): Promise<VerifiedRequest> {
  const bodyBytes = new Uint8Array(await request.arrayBuffer());
  if (bodyBytes.length > P6_LIMITS.maxRequestBodyBytes) {
    return { ok: false, code: NEXUS_ERROR_CODES.BODY_TOO_LARGE, message: "Request body too large" };
  }

  const protocolHeader = request.headers.get(CONNECTOR_HEADERS.protocolVersion);
  if (protocolHeader && protocolHeader !== P6_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: NEXUS_ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED,
      message: "Unsupported protocol version",
    };
  }

  const path = new URL(request.url).pathname;
  const verification = await verifyConnectorRequestSignature({
    connectorId: request.headers.get(CONNECTOR_HEADERS.connectorId),
    timestampHeader: request.headers.get(CONNECTOR_HEADERS.timestamp),
    nonce: request.headers.get(CONNECTOR_HEADERS.nonce),
    signatureHex: request.headers.get(CONNECTOR_HEADERS.signature),
    method: request.method,
    path,
    bodyBytes,
    now: Date.now(),
  });

  if (!verification.ok) {
    const message =
      verification.code === "stale_timestamp"
        ? "Request timestamp outside the allowed window"
        : verification.code === "invalid_signature"
          ? "Signature verification failed"
          : verification.code === "connector_unauthorized"
            ? "Unknown Connector"
            : "Malformed Connector request";
    return { ok: false, code: verification.code, message };
  }

  // Signature is valid — now atomically consume the nonce (replay guard).
  try {
    await ctx.runMutation(internal.connectorAuthStore.verifyAndConsumeNonce, {
      connectorId: verification.connectorId,
      nonce: verification.nonce,
      requestTimestamp: verification.timestamp,
    });
  } catch (error) {
    const stable = toStableError(error);
    return { ok: false, code: stable.code, message: stable.message };
  }

  let payload: Record<string, unknown> = {};
  if (bodyBytes.length > 0) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        return { ok: false, code: NEXUS_ERROR_CODES.INVALID_REQUEST, message: "Body must be a JSON object" };
      }
    } catch {
      return { ok: false, code: NEXUS_ERROR_CODES.INVALID_REQUEST, message: "Body is not valid JSON" };
    }
  }

  return { ok: true, connectorId: verification.connectorId, payload };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const heartbeatHandler = httpAction(async (ctx, request) => {
  const requestId = newRequestId();
  const auth = await authenticate(ctx, request);
  if (!auth.ok) return errorResponse(auth.code, auth.message, requestId);

  try {
    const data = await ctx.runMutation(internal.connectorRegistry.heartbeatConnector, {
      connectorId: auth.connectorId,
      softwareVersion: str(auth.payload.softwareVersion),
      hostLabel: str(auth.payload.hostLabel),
      environment: str(auth.payload.environment),
      operatingState: str(auth.payload.operatingState) as
        | "idle"
        | "claiming"
        | "running"
        | "degraded"
        | undefined,
      lastErrorCode: str(auth.payload.lastErrorCode),
    });
    return okResponse(data, requestId);
  } catch (error) {
    const stable = toStableError(error);
    return errorResponse(stable.code, stable.message, requestId);
  }
});

const claimHandler = httpAction(async (ctx, request) => {
  const requestId = newRequestId();
  const auth = await authenticate(ctx, request);
  if (!auth.ok) return errorResponse(auth.code, auth.message, requestId);

  try {
    const data = await ctx.runMutation(internal.connectorTasks.claimNextTask, {
      connectorId: auth.connectorId,
      softwareVersion: str(auth.payload.softwareVersion),
      hostLabel: str(auth.payload.hostLabel),
    });
    return okResponse(data, requestId);
  } catch (error) {
    const stable = toStableError(error);
    return errorResponse(stable.code, stable.message, requestId);
  }
});

/**
 * Single task-operation endpoint with a strict `action` discriminator. NOT a
 * generic mutation passthrough: each action maps to exactly one internal
 * mutation/query, and only that action's known fields are forwarded.
 */
const taskHandler = httpAction(async (ctx, request) => {
  const requestId = newRequestId();
  const auth = await authenticate(ctx, request);
  if (!auth.ok) return errorResponse(auth.code, auth.message, requestId);

  const { connectorId, payload } = auth;
  const action = str(payload.action);
  const taskId = str(payload.taskId);
  const leaseId = str(payload.leaseId);

  if (!action || !taskId || !leaseId) {
    return errorResponse(
      NEXUS_ERROR_CODES.INVALID_REQUEST,
      "action, taskId and leaseId are required",
      requestId,
    );
  }
  const typedTaskId = taskId as import("./_generated/dataModel").Id<"nexusTasks">;

  try {
    let data: unknown;
    switch (action) {
      case "start":
        data = await ctx.runMutation(internal.connectorTasks.startTask, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
        });
        break;
      case "lease_heartbeat":
        data = await ctx.runMutation(internal.connectorTasks.heartbeatTaskLease, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
        });
        break;
      case "cancellation":
        data = await ctx.runQuery(internal.connectorReads.getTaskCancellationState, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
        });
        break;
      case "progress":
        data = await ctx.runMutation(internal.connectorTasks.appendConnectorProgress, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
          message: str(payload.message),
          stage: str(payload.stage),
          percent: num(payload.percent),
        });
        break;
      case "complete":
        data = await ctx.runMutation(internal.connectorTasks.completeTask, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
          answerText: str(payload.answerText) ?? "",
          format: str(payload.format) as "markdown" | "plain" | undefined,
          sources: normalizeSources(payload.sources),
          model: str(payload.model),
          toolId: str(payload.toolId),
          durationMs: num(payload.durationMs),
        });
        break;
      case "fail":
        data = await ctx.runMutation(internal.connectorTasks.failTask, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
          errorCode: str(payload.errorCode) ?? "connector_error",
          userSafeMessage: str(payload.userSafeMessage) ?? "The task failed.",
          retryable: bool(payload.retryable),
          stage: str(payload.stage),
        });
        break;
      case "acknowledge_cancellation":
        data = await ctx.runMutation(internal.connectorTasks.acknowledgeCancellation, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
        });
        break;
      case "release":
        data = await ctx.runMutation(internal.connectorTasks.releaseClaim, {
          connectorId,
          taskId: typedTaskId,
          leaseId,
          reason: str(payload.reason),
        });
        break;
      default:
        return errorResponse(NEXUS_ERROR_CODES.INVALID_REQUEST, "Unknown task action", requestId);
    }
    return okResponse(data, requestId);
  } catch (error) {
    const stable = toStableError(error);
    return errorResponse(stable.code, stable.message, requestId);
  }
});

type NormalizedSource = {
  sourceType: "vault_note" | "membership_transcript" | "web" | "file" | "other";
  title: string;
  locator?: string;
  excerpt?: string;
  provenanceLabel?: string;
};

const SOURCE_TYPES = ["vault_note", "membership_transcript", "web", "file", "other"] as const;

/** Coerce an untrusted `sources` array into the strict source shape, dropping
 * malformed entries. Length/excerpt bounds are enforced server-side by the
 * completeTask mutation regardless. */
function normalizeSources(value: unknown): NormalizedSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: NormalizedSource[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const sourceType = str(record.sourceType);
    const title = str(record.title);
    if (!title) continue;
    const safeType = (SOURCE_TYPES as readonly string[]).includes(sourceType ?? "")
      ? (sourceType as NormalizedSource["sourceType"])
      : "other";
    out.push({
      sourceType: safeType,
      title,
      locator: str(record.locator),
      excerpt: str(record.excerpt),
      provenanceLabel: str(record.provenanceLabel),
    });
  }
  return out;
}

const http = httpRouter();

http.route({ path: "/api/connector/v1/heartbeat", method: "POST", handler: heartbeatHandler });
http.route({ path: "/api/connector/v1/claim", method: "POST", handler: claimHandler });
http.route({ path: "/api/connector/v1/task", method: "POST", handler: taskHandler });

export default http;
