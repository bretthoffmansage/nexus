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
  [NEXUS_ERROR_CODES.ATTACHMENT_NOT_FOUND]: 404,
  [NEXUS_ERROR_CODES.ATTACHMENT_NOT_BOUND]: 404,
  [NEXUS_ERROR_CODES.ATTACHMENT_VERSION_MISMATCH]: 409,
  [NEXUS_ERROR_CODES.ATTACHMENT_UNAVAILABLE]: 404,
  [NEXUS_ERROR_CODES.ATTACHMENT_STORAGE_UNAVAILABLE]: 404,
  [NEXUS_ERROR_CODES.ATTACHMENT_METADATA_MISMATCH]: 409,
  [NEXUS_ERROR_CODES.ATTACHMENT_TOO_LARGE]: 413,
  [NEXUS_ERROR_CODES.UNSUPPORTED_ATTACHMENT_ACTION]: 400,
  [NEXUS_ERROR_CODES.ATTACHMENT_READ_FAILED]: 500,
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
          dropzoneResult: normalizeDropzoneResult(payload.dropzoneResult),
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

const DROPZONE_DISPOSITIONS = [
  "processed",
  "needs_review",
  "failed",
  "blocked",
  "paused",
  "already_completed",
] as const;

function normalizeDropzoneResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const processingDisposition = str(record.processingDisposition);
  const userSafeMessage = str(record.userSafeMessage);
  if (!processingDisposition || !userSafeMessage) return undefined;
  if (!(DROPZONE_DISPOSITIONS as readonly string[]).includes(processingDisposition)) {
    return undefined;
  }
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((w): w is string => typeof w === "string").slice(0, 8)
    : undefined;
  return {
    processingDisposition: processingDisposition as (typeof DROPZONE_DISPOSITIONS)[number],
    userSafeMessage,
    notesCreated: num(record.notesCreated),
    vaultLocatorCount: num(record.vaultLocatorCount),
    warnings,
    retryable: bool(record.retryable),
    partial: bool(record.partial),
  };
}

const attachmentHandler = httpAction(async (ctx, request) => {
  const requestId = newRequestId();
  const startedAt = Date.now();
  if (request.headers.get("range")) {
    return errorResponse(
      NEXUS_ERROR_CODES.INVALID_REQUEST,
      "Range requests are not supported in attachment protocol v1",
      requestId,
    );
  }

  const auth = await authenticate(ctx, request);
  if (!auth.ok) {
    const { logAttachmentDownloadDiagnostic } = await import("./connectorAttachments");
    logAttachmentDownloadDiagnostic({
      requestId,
      stage: "auth_rejected",
      connectorId: request.headers.get("x-nexus-connector-id") ?? undefined,
      errorCode: auth.code,
      httpStatus: HTTP_STATUS_BY_CODE[auth.code] ?? 400,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(auth.code, auth.message, requestId);
  }

  const action = str(auth.payload.action);
  if (action !== "download") {
    return errorResponse(NEXUS_ERROR_CODES.UNSUPPORTED_ATTACHMENT_ACTION, "Unsupported attachment action", requestId);
  }
  const taskId = str(auth.payload.taskId);
  const leaseId = str(auth.payload.leaseId);
  const attachmentId = str(auth.payload.attachmentId);
  if (!taskId || !leaseId || !attachmentId) {
    return errorResponse(
      NEXUS_ERROR_CODES.INVALID_REQUEST,
      "action, taskId, leaseId and attachmentId are required",
      requestId,
    );
  }

  const { attachmentSuccessHeaders, logAttachmentDownloadDiagnostic } = await import(
    "./connectorAttachments"
  );

  try {
    const info = await ctx.runQuery(internal.connectorAttachments.authorizeAttachmentDownload, {
      connectorId: auth.connectorId,
      taskId: taskId as import("./_generated/dataModel").Id<"nexusTasks">,
      leaseId,
      attachmentId,
      now: Date.now(),
    });

    logAttachmentDownloadDiagnostic({
      requestId,
      stage: "authorized",
      taskId,
      attachmentId,
      connectorId: auth.connectorId,
      expectedByteLength: info.byteLength,
    });

    const blob = await ctx.storage.get(info.storageId);
    if (!blob) {
      logAttachmentDownloadDiagnostic({
        requestId,
        stage: "storage_blob_missing",
        taskId,
        attachmentId,
        connectorId: auth.connectorId,
        errorCode: NEXUS_ERROR_CODES.ATTACHMENT_STORAGE_UNAVAILABLE,
        httpStatus: HTTP_STATUS_BY_CODE[NEXUS_ERROR_CODES.ATTACHMENT_STORAGE_UNAVAILABLE],
        expectedByteLength: info.byteLength,
        durationMs: Date.now() - startedAt,
      });
      return errorResponse(
        NEXUS_ERROR_CODES.ATTACHMENT_STORAGE_UNAVAILABLE,
        "Stored attachment is unavailable",
        requestId,
      );
    }

    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength !== info.byteLength) {
      logAttachmentDownloadDiagnostic({
        requestId,
        stage: "storage_blob_size_mismatch",
        taskId,
        attachmentId,
        connectorId: auth.connectorId,
        errorCode: NEXUS_ERROR_CODES.ATTACHMENT_METADATA_MISMATCH,
        httpStatus: HTTP_STATUS_BY_CODE[NEXUS_ERROR_CODES.ATTACHMENT_METADATA_MISMATCH],
        expectedByteLength: info.byteLength,
        bytesSent: bytes.byteLength,
        durationMs: Date.now() - startedAt,
      });
      return errorResponse(
        NEXUS_ERROR_CODES.ATTACHMENT_METADATA_MISMATCH,
        "Attachment byte length mismatch",
        requestId,
      );
    }

    const headers = attachmentSuccessHeaders({
      attachmentId: info.attachmentId,
      documentVersionId: info.documentVersionId,
      contentType: info.contentType,
      displayFilename: info.displayFilename,
      byteLength: info.byteLength,
      sha256: info.sha256,
      requestId,
    });

    logAttachmentDownloadDiagnostic({
      requestId,
      stage: "response_sent",
      taskId,
      attachmentId,
      connectorId: auth.connectorId,
      httpStatus: 200,
      expectedByteLength: info.byteLength,
      bytesSent: bytes.byteLength,
      durationMs: Date.now() - startedAt,
    });

    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    const stable = toStableError(error);
    logAttachmentDownloadDiagnostic({
      requestId,
      stage: "handler_error",
      taskId,
      attachmentId,
      connectorId: auth.connectorId,
      errorCode: stable.code,
      httpStatus: HTTP_STATUS_BY_CODE[stable.code] ?? 400,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(stable.code, stable.message, requestId);
  }
});

const http = httpRouter();

http.route({ path: "/api/connector/v1/heartbeat", method: "POST", handler: heartbeatHandler });
http.route({ path: "/api/connector/v1/claim", method: "POST", handler: claimHandler });
http.route({ path: "/api/connector/v1/task", method: "POST", handler: taskHandler });
http.route({ path: "/api/connector/v1/attachment", method: "POST", handler: attachmentHandler });

export default http;
