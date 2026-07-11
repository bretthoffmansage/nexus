import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  clampLength,
  P5_LIMITS,
  WORKER_ACTIVITY_LIMITS,
  isWorkerActivityPhase,
  isWorkerActivityStatus,
  isWorkerActivitySurface,
  isWorkerActivityToolId,
  isWorkerActivityWorker,
} from "./lib/p5config";
import { appendMessage, appendProgress, recordAudit, touchConversation, writeCanonicalTaskResult, replaceTaskSourceRows } from "./lib/p5writes";
import { effectiveExecutionRequestText } from "./lib/conversationContext";
import { performTaskTransition } from "./lib/taskTransitions";
import { type TaskStatus } from "./lib/taskStatus";
import { requireActiveConnector } from "./connectorRegistry";
import {
  DEFAULT_CONNECTOR_TOOL_IDS,
  P6_LEASE,
  P6_LIMITS,
  P6_PROTOCOL_VERSION,
  executionSafetyForTool,
  isConnectorProgressStage,
} from "./lib/p6config";
import { LIBRARY_ATTACHMENT_DOWNLOAD_PATH } from "./lib/libraryDropzoneConfig";
import { patchScheduledEventForTaskStatus } from "./lib/calendarProjection";
import {
  applyDropzoneTerminalResult,
  patchLibraryVersionForTaskStatus,
  type DropzoneProcessingDisposition,
} from "./lib/libraryProjection";

/**
 * P6 — trusted Connector task protocol business logic.
 *
 * Every mutation here is `internalMutation` — none is callable from the
 * browser. The only entry points are the signed-and-verified HTTP actions in
 * `convex/http.ts`. `nexusTasks` remains the single canonical queue; nothing
 * here creates a second queue table or duplicates task rows.
 *
 * Every task-scoped operation checks, in this fixed order: (1) the task
 * exists, (2) the caller holds the current lease (`requireLeaseOwnership` —
 * this is where `wrong_connector` / `wrong_lease` / `lease_expired` /
 * `task_not_claimed` are raised), (3) the task's status permits the
 * operation. Ownership of user data is always copied from the task record —
 * never trusted from the request body.
 */

const ACTIVE_LEASE_STATUSES: readonly TaskStatus[] = ["claimed", "running", "cancel_requested"];

const sourceTypeValidator = v.union(
  v.literal("vault_note"),
  v.literal("membership_transcript"),
  v.literal("web"),
  v.literal("file"),
  v.literal("other"),
);

const dropzoneDispositionValidator = v.union(
  v.literal("processed"),
  v.literal("needs_review"),
  v.literal("failed"),
  v.literal("blocked"),
  v.literal("paused"),
  v.literal("already_completed"),
);

async function loadClaimAttachments(ctx: MutationCtx, taskId: Id<"nexusTasks">) {
  const rows = await ctx.db
    .query("nexusTaskAttachments")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  return rows.map((row) => ({
    attachmentId: row.attachmentId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    role: row.role,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    fileExtension: row.fileExtension,
    byteLength: row.byteLength,
    sha256: row.sha256,
    downloadPath: LIBRARY_ATTACHMENT_DOWNLOAD_PATH,
  }));
}

function requireLeaseOwnership(
  task: Doc<"nexusTasks">,
  connectorId: string,
  leaseId: string,
  now: number,
): void {
  if (!task.claimedByConnectorId) {
    nexusError(NEXUS_ERROR_CODES.TASK_NOT_CLAIMED, "Task is not currently claimed");
  }
  if (task.claimedByConnectorId !== connectorId) {
    nexusError(NEXUS_ERROR_CODES.WRONG_CONNECTOR, "Task is claimed by a different Connector");
  }
  if (task.leaseId !== leaseId) {
    nexusError(NEXUS_ERROR_CODES.WRONG_LEASE, "Lease id does not match the current claim");
  }
  if (task.leaseExpiresAt === undefined || task.leaseExpiresAt < now) {
    nexusError(NEXUS_ERROR_CODES.LEASE_EXPIRED, "Lease has expired");
  }
}

async function clearConnectorCurrentTask(
  ctx: MutationCtx,
  connectorId: string,
  taskId: Id<"nexusTasks">,
  now: number,
): Promise<void> {
  const connector = await ctx.db
    .query("nexusConnectors")
    .withIndex("by_connector_id", (q) => q.eq("connectorId", connectorId))
    .unique();
  if (connector && connector.currentTaskId === taskId) {
    await ctx.db.patch(connector._id, {
      currentTaskId: undefined,
      currentLeaseId: undefined,
      operatingState: "idle",
      lastSeenAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Atomic claim of the oldest eligible `queued` task, honoring the canonical
 * global queue order (`by_status_and_priority_and_queue_sequence` — the same
 * index P5 reserved for exactly this purpose). Bounded look-ahead: scans up
 * to 50 candidate tasks for one matching the Connector's tool allowlist. In
 * practice every Connector supports the full P5 tool set, so this bound is
 * not expected to ever skip an eligible task; it exists to keep the
 * mutation's work bounded rather than unbounded.
 */
export const claimNextTask = internalMutation({
  args: {
    connectorId: v.string(),
    softwareVersion: v.optional(v.string()),
    hostLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connector = await requireActiveConnector(ctx, args.connectorId);
    const now = Date.now();

    // Opportunistic stale-lease recovery so an abandoned claim never blocks
    // new work indefinitely (also runs on a schedule — see convex/crons.ts).
    await recoverStaleLeasesBatch(ctx, now);

    if (connector.currentTaskId && connector.currentLeaseId) {
      const activeTask = await ctx.db.get(connector.currentTaskId);
      const stillActive =
        activeTask !== null &&
        ACTIVE_LEASE_STATUSES.includes(activeTask.status) &&
        activeTask.leaseId === connector.currentLeaseId &&
        activeTask.leaseExpiresAt !== undefined &&
        activeTask.leaseExpiresAt >= now;
      if (stillActive) {
        nexusError(NEXUS_ERROR_CODES.CONNECTOR_BUSY, "Connector already holds an active task");
      }
      // Bookkeeping was stale (already recovered above, or task went
      // terminal without going through this Connector's own call) — self-heal.
      await ctx.db.patch(connector._id, {
        currentTaskId: undefined,
        currentLeaseId: undefined,
        updatedAt: now,
      });
    }

    const allowedToolIds = connector.allowedToolIds ?? DEFAULT_CONNECTOR_TOOL_IDS;
    const candidates = await ctx.db
      .query("nexusTasks")
      .withIndex("by_status_and_priority_and_queue_sequence", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(50);
    const target = candidates.find((task) => allowedToolIds.includes(task.requestedToolId));

    const connectorPatch: Partial<Doc<"nexusConnectors">> = {
      lastSeenAt: now,
      updatedAt: now,
    };
    if (args.softwareVersion !== undefined) {
      connectorPatch.softwareVersion = args.softwareVersion.slice(0, P6_LIMITS.maxSoftwareVersionLength);
    }
    if (args.hostLabel !== undefined) {
      connectorPatch.hostLabel = args.hostLabel.slice(0, P6_LIMITS.maxHostLabelLength);
    }

    if (!target) {
      await ctx.db.patch(connector._id, { ...connectorPatch, operatingState: "idle" });
      return { status: "idle" as const, task: null };
    }

    const leaseId = crypto.randomUUID();
    const leaseExpiresAt = now + P6_LEASE.initialLeaseDurationMs;
    const claimAttempt = (target.claimAttempt ?? 0) + 1;

    await ctx.db.patch(target._id, {
      status: "claimed",
      claimedByConnectorId: args.connectorId,
      leaseId,
      leaseExpiresAt,
      lastLeaseHeartbeatAt: now,
      claimAttempt,
      claimedAt: now,
      updatedAt: now,
    });
    await appendProgress(ctx, {
      taskId: target._id,
      ownerClerkUserId: target.ownerClerkUserId,
      eventType: "task_claimed",
      message: "Claimed by the Console Connector.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: target.ownerClerkUserId,
      eventType: "task_claimed",
      conversationId: target.conversationId,
      taskId: target._id,
      connectorId: args.connectorId,
      now,
    });
    await touchConversation(ctx, target.conversationId, { now });
    await patchLibraryVersionForTaskStatus(ctx, target, "claimed");
    await patchScheduledEventForTaskStatus(ctx, target);
    await ctx.db.patch(connector._id, {
      ...connectorPatch,
      currentTaskId: target._id,
      currentLeaseId: leaseId,
      operatingState: "running",
    });

    const attachments = await loadClaimAttachments(ctx, target._id);

    return {
      status: "claimed" as const,
      task: {
        taskId: target._id,
        leaseId,
        conversationId: target.conversationId,
        requestMessageId: target.requestMessageId,
        requestedToolId: target.requestedToolId,
        requestText: effectiveExecutionRequestText(target),
        requestedModelId: target.requestedModelId,
        taskKind: target.taskKind,
        taskMetadata: target.taskMetadata,
        attemptNumber: target.attemptNumber,
        createdAt: target.createdAt,
        queueSequence: target.queueSequence,
        cancellationState: "none" as const,
        leaseExpiresAt,
        protocolVersion: P6_PROTOCOL_VERSION,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
    };
  },
});

/** claimed -> running. Idempotent for a repeated identical call. */
export const startTask = internalMutation({
  args: { connectorId: v.string(), taskId: v.id("nexusTasks"), leaseId: v.string() },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();

    if (
      task.status === "running" &&
      task.claimedByConnectorId === args.connectorId &&
      task.leaseId === args.leaseId
    ) {
      return { taskId: task._id, status: "running" as const, startedAt: task.startedAt ?? now };
    }

    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);
    if (task.status === "cancel_requested") {
      nexusError(NEXUS_ERROR_CODES.CANCELLATION_REQUESTED, "Cancellation has been requested");
    }
    if (task.status !== "claimed") {
      nexusError(NEXUS_ERROR_CODES.INVALID_TASK_STATE, `Cannot start a task in status ${task.status}`);
    }

    const transition = await performTaskTransition(ctx, {
      taskId: task._id,
      toStatus: "running",
      progressMessage: "Execution started.",
    });
    await patchLibraryVersionForTaskStatus(ctx, task, "running", "Processing document.");
    await patchScheduledEventForTaskStatus(ctx, task, "Processing.");
    await recordAudit(ctx, {
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "task_started",
      conversationId: task.conversationId,
      taskId: task._id,
      connectorId: args.connectorId,
      now,
    });
    return { taskId: transition.taskId, status: transition.status, startedAt: now };
  },
});

/** Extends a task's lease. No grace window past expiry — a Connector must
 * heartbeat before `leaseExpiresAt`; once expired, recovery policy governs
 * and the Connector must stop work and re-claim. Returns whether the user
 * has requested cancellation, so the P7 poller learns to stop even though
 * The system itself has no inbound channel. */
export const heartbeatTaskLease = internalMutation({
  args: { connectorId: v.string(), taskId: v.id("nexusTasks"), leaseId: v.string() },
  handler: async (ctx, args) => {
    const connector = await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();
    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);

    if (!ACTIVE_LEASE_STATUSES.includes(task.status)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_TASK_STATE, `Cannot heartbeat a task in status ${task.status}`);
    }

    const leaseExpiresAt = now + P6_LEASE.renewalExtensionMs;
    await ctx.db.patch(task._id, { lastLeaseHeartbeatAt: now, leaseExpiresAt, updatedAt: now });
    await ctx.db.patch(connector._id, { lastSeenAt: now, lastHeartbeatAt: now, updatedAt: now });

    return {
      taskId: task._id,
      status: task.status,
      leaseExpiresAt,
      cancellationRequested: task.status === "cancel_requested",
    };
  },
});

/** Bounded, user-safe progress reporting. Heartbeats are not appended here —
 * see `heartbeatTaskLease` — so routine polling never produces noisy
 * user-visible progress entries. */
export const appendConnectorProgress = internalMutation({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    message: v.optional(v.string()),
    stage: v.optional(v.string()),
    percent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();
    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);

    if (!ACTIVE_LEASE_STATUSES.includes(task.status)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_TASK_STATE, `Cannot report progress for a task in status ${task.status}`);
    }
    if (args.message !== undefined && args.message.length > P6_LIMITS.maxProgressMessageLength) {
      nexusError(NEXUS_ERROR_CODES.PROGRESS_TOO_LARGE, "Progress message exceeds the maximum length");
    }
    if (args.stage !== undefined && !isConnectorProgressStage(args.stage)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_REQUEST, "Unsupported progress stage");
    }

    const metadata =
      args.stage !== undefined || args.percent !== undefined
        ? {
            ...(args.stage !== undefined ? { stage: args.stage } : {}),
            ...(args.percent !== undefined
              ? { percent: Math.max(0, Math.min(100, Math.round(args.percent))) }
              : {}),
          }
        : undefined;

    await appendProgress(ctx, {
      taskId: task._id,
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "tool_progress",
      message: args.message,
      metadata,
      now,
    });
    if (task.libraryDocumentVersionId) {
      await patchLibraryVersionForTaskStatus(ctx, task, task.status, args.message);
    }
    if (task.scheduledEventId) {
      await patchScheduledEventForTaskStatus(ctx, task, args.message);
    }
    return { taskId: task._id, accepted: true as const };
  },
});

/**
 * Bounded, sanitized worker-activity readback (UI-only). Distinct from
 * `appendConnectorProgress`: it carries an allowlisted worker-activity vocabulary
 * (surface/worker/phase/status) that is deliberately kept separate from the
 * technical `tool_progress` stage vocabulary so neither validation path can
 * entangle the other. It reuses the same table, the same `appendProgress`
 * writer, the same `/task` endpoint, and the same lease/ownership checks — no
 * new route, queue, table, or channel.
 *
 * Forward-compatible by design: an event whose tuple is not (yet) allowlisted is
 * accepted-and-dropped rather than errored, so a newer system phase can never
 * fail a task or corrupt the feed. Ownership is always copied from the task.
 */
export const appendConnectorActivity = internalMutation({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    surface: v.string(),
    toolId: v.string(),
    worker: v.string(),
    phase: v.string(),
    status: v.string(),
    message: v.string(),
    occurredAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();
    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);

    if (!ACTIVE_LEASE_STATUSES.includes(task.status)) {
      // Activity is only meaningful for an in-flight task; ignore late events
      // without erroring (the worker may race the terminal transition).
      return { taskId: task._id, accepted: true as const, dropped: "not_active" as const };
    }

    // Drop (do not error) anything outside the allowlisted vocabulary — this is
    // the safety boundary and the forward-compat mechanism in one.
    if (
      !isWorkerActivitySurface(args.surface) ||
      !isWorkerActivityToolId(args.toolId) ||
      !isWorkerActivityWorker(args.worker) ||
      !isWorkerActivityPhase(args.phase) ||
      !isWorkerActivityStatus(args.status)
    ) {
      return { taskId: task._id, accepted: true as const, dropped: "unrecognized" as const };
    }

    // Defense-in-depth: single-line + trimmed + clamped. The system already
    // sanitizes, and the UI clamps again on render; this guarantees the stored
    // value is safe on its own and that a whitespace-only message is dropped.
    const message = clampLength(
      args.message.replace(/\s+/g, " ").trim(),
      WORKER_ACTIVITY_LIMITS.maxMessageLength,
    );
    if (!message) {
      return { taskId: task._id, accepted: true as const, dropped: "empty" as const };
    }

    // Per-task bound (defense-in-depth on top of the system's emission cap). One
    // cheap read of the newest event; sequences are gap-free from 1, so the
    // latest sequence is the total progress-event count for the task.
    const last = await ctx.db
      .query("nexusTaskProgressEvents")
      .withIndex("by_task_and_sequence", (q) => q.eq("taskId", task._id))
      .order("desc")
      .first();
    if ((last?.sequence ?? 0) >= WORKER_ACTIVITY_LIMITS.maxEventsPerTask * 5) {
      return { taskId: task._id, accepted: true as const, dropped: "bounded" as const };
    }

    const occurredAt = typeof args.occurredAt === "string" ? args.occurredAt.slice(0, 40) : undefined;
    await appendProgress(ctx, {
      taskId: task._id,
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "worker_activity",
      message,
      metadata: {
        surface: args.surface,
        toolId: args.toolId,
        worker: args.worker,
        phase: args.phase,
        status: args.status,
        ...(occurredAt ? { occurredAt } : {}),
      },
      now,
    });
    return { taskId: task._id, accepted: true as const };
  },
});

/**
 * Trusted completion. Idempotent for the same Connector; a different
 * Connector attempting to complete an already-completed task is rejected
 * (`completion_conflict`) rather than silently accepted or overwritten.
 */
export const completeTask = internalMutation({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    answerText: v.string(),
    format: v.optional(v.union(v.literal("markdown"), v.literal("plain"))),
    sources: v.optional(
      v.array(
        v.object({
          sourceType: sourceTypeValidator,
          title: v.string(),
          locator: v.optional(v.string()),
          excerpt: v.optional(v.string()),
          provenanceLabel: v.optional(v.string()),
        }),
      ),
    ),
    model: v.optional(v.string()),
    toolId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    dropzoneResult: v.optional(
      v.object({
        processingDisposition: dropzoneDispositionValidator,
        userSafeMessage: v.string(),
        notesCreated: v.optional(v.number()),
        vaultLocatorCount: v.optional(v.number()),
        warnings: v.optional(v.array(v.string())),
        retryable: v.optional(v.boolean()),
        partial: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();

    if (task.status === "completed") {
      if (task.claimedByConnectorId !== args.connectorId) {
        nexusError(NEXUS_ERROR_CODES.COMPLETION_CONFLICT, "Task was already completed by a different Connector");
      }
      const existingResult = await ctx.db
        .query("nexusTaskResults")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .unique();
      return {
        taskId: task._id,
        status: "completed" as const,
        resultId: existingResult?._id ?? null,
        completedAt: task.completedAt ?? now,
        idempotent: true,
      };
    }

    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);
    if (task.status === "cancel_requested") {
      nexusError(
        NEXUS_ERROR_CODES.CANCELLATION_REQUESTED,
        "Cancellation has been requested; acknowledge it instead of completing",
      );
    }
    // A task must have been started (claim -> start -> running) before it can
    // be completed. Reject a `claimed` (never started) task with a clean error
    // instead of letting the later status transition roll everything back.
    if (task.status !== "running") {
      nexusError(NEXUS_ERROR_CODES.INVALID_TASK_STATE, `Cannot complete a task in status ${task.status}`);
    }
    if (args.answerText.length > P6_LIMITS.maxAnswerLength) {
      nexusError(NEXUS_ERROR_CODES.RESULT_TOO_LARGE, "Answer exceeds the maximum length");
    }
    const sources = args.sources ?? [];
    if (sources.length > P6_LIMITS.maxSourceCount) {
      nexusError(NEXUS_ERROR_CODES.TOO_MANY_SOURCES, "Too many sources");
    }

    await writeCanonicalTaskResult(ctx, {
      taskId: task._id,
      ownerClerkUserId: task.ownerClerkUserId,
      answerText: args.answerText,
      format: args.format,
      completedBy: args.connectorId,
      model: args.model,
      toolId: args.toolId ?? task.requestedToolId,
      durationMs: args.durationMs,
      now,
    });
    await replaceTaskSourceRows(ctx, {
      taskId: task._id,
      ownerClerkUserId: task.ownerClerkUserId,
      sources,
      now,
    });
    if (task.conversationId) {
      await appendMessage(ctx, {
        conversationId: task.conversationId,
        ownerClerkUserId: task.ownerClerkUserId,
        author: "assistant",
        kind: "result_summary",
        content: clampLength(args.answerText, P5_LIMITS.maxMessageLength),
        taskId: task._id,
        now,
      });
    }
    if (args.dropzoneResult && task.libraryDocumentVersionId) {
      await applyDropzoneTerminalResult(ctx, task, {
        processingDisposition: args.dropzoneResult.processingDisposition as DropzoneProcessingDisposition,
        userSafeMessage: args.dropzoneResult.userSafeMessage,
        notesCreated: args.dropzoneResult.notesCreated,
        vaultLocatorCount: args.dropzoneResult.vaultLocatorCount,
        warnings: args.dropzoneResult.warnings,
        retryable: args.dropzoneResult.retryable,
        partial: args.dropzoneResult.partial,
      });
    } else if (task.libraryDocumentVersionId) {
      await patchLibraryVersionForTaskStatus(ctx, task, "completed", args.answerText);
    }
    const transition = await performTaskTransition(ctx, {
      taskId: task._id,
      toStatus: "completed",
      resultSummary: args.answerText.slice(0, P5_LIMITS.maxResultSummaryLength),
      progressMessage: "Completed by the Console Connector.",
    });
    const completedTask = await ctx.db.get(task._id);
    if (completedTask?.scheduledEventId) {
      await patchScheduledEventForTaskStatus(
        ctx,
        completedTask,
        args.answerText.slice(0, P5_LIMITS.maxResultSummaryLength),
      );
    }
    await recordAudit(ctx, {
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "task_completed",
      conversationId: task.conversationId,
      taskId: task._id,
      connectorId: args.connectorId,
      now,
      metadata: { sourceCount: sources.length },
    });
    await clearConnectorCurrentTask(ctx, args.connectorId, task._id, now);

    const result = await ctx.db
      .query("nexusTaskResults")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .unique();
    return {
      taskId: transition.taskId,
      status: "completed" as const,
      resultId: result?._id ?? null,
      completedAt: now,
      idempotent: false,
    };
  },
});

/** Trusted failure. Bounded, user-safe fields only — never a raw stack
 * trace, environment dump, or filesystem path. Idempotent for the same
 * Connector; remains user-retryable per P5's existing retry rules. */
export const failTask = internalMutation({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    errorCode: v.string(),
    userSafeMessage: v.string(),
    retryable: v.optional(v.boolean()),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();

    if (task.status === "failed") {
      if (task.claimedByConnectorId !== args.connectorId) {
        nexusError(NEXUS_ERROR_CODES.COMPLETION_CONFLICT, "Task was already failed by a different Connector");
      }
      return { taskId: task._id, status: "failed" as const, failedAt: task.failedAt ?? now, idempotent: true };
    }

    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);
    if (task.status === "cancel_requested") {
      nexusError(
        NEXUS_ERROR_CODES.CANCELLATION_REQUESTED,
        "Cancellation has been requested; acknowledge it instead of failing",
      );
    }
    if (args.userSafeMessage.length > P6_LIMITS.maxErrorMessageLength) {
      nexusError(NEXUS_ERROR_CODES.INVALID_REQUEST, "Error message exceeds the maximum length");
    }
    if (args.stage !== undefined && !isConnectorProgressStage(args.stage)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_REQUEST, "Unsupported stage");
    }

    const transition = await performTaskTransition(ctx, {
      taskId: task._id,
      toStatus: "failed",
      errorCode: args.errorCode,
      errorMessage: args.userSafeMessage,
      progressMessage: args.userSafeMessage,
    });
    if (task.conversationId) {
      await appendMessage(ctx, {
        conversationId: task.conversationId,
        ownerClerkUserId: task.ownerClerkUserId,
        author: "system",
        kind: "error",
        content: clampLength(args.userSafeMessage, P5_LIMITS.maxMessageLength),
        taskId: task._id,
        now,
      });
    }
    if (task.libraryDocumentVersionId) {
      await patchLibraryVersionForTaskStatus(ctx, task, "failed", args.userSafeMessage);
      const version = await ctx.db.get(task.libraryDocumentVersionId);
      if (version) {
        await ctx.db.patch(version._id, {
          terminalSummary: clampLength(args.userSafeMessage, P5_LIMITS.maxResultSummaryLength),
          terminalRetryable: args.retryable,
          updatedAt: now,
        });
      }
    }
    const failedTask = await ctx.db.get(task._id);
    if (failedTask?.scheduledEventId) {
      await patchScheduledEventForTaskStatus(ctx, failedTask, args.userSafeMessage);
    }
    await recordAudit(ctx, {
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "task_failed",
      conversationId: task.conversationId,
      taskId: task._id,
      connectorId: args.connectorId,
      now,
      metadata: { errorCode: args.errorCode, retryable: args.retryable ?? true },
    });
    await clearConnectorCurrentTask(ctx, args.connectorId, task._id, now);

    return { taskId: transition.taskId, status: "failed" as const, failedAt: now, idempotent: false };
  },
});

/** Finalizes a `cancel_requested` task to `cancelled`. Only the Connector
 * holding the lease may acknowledge — this is the documented, required path
 * (P6 never auto-cancels on behalf of the Connector except via stale-lease
 * recovery, which is a distinct, separately-audited policy). */
export const acknowledgeCancellation = internalMutation({
  args: { connectorId: v.string(), taskId: v.id("nexusTasks"), leaseId: v.string() },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();

    if (task.status === "cancelled") {
      if (task.claimedByConnectorId && task.claimedByConnectorId !== args.connectorId) {
        nexusError(NEXUS_ERROR_CODES.COMPLETION_CONFLICT, "Task was already cancelled");
      }
      return { taskId: task._id, status: "cancelled" as const, cancelledAt: task.cancelledAt ?? now, idempotent: true };
    }

    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);
    if (task.status !== "cancel_requested") {
      nexusError(
        NEXUS_ERROR_CODES.INVALID_TASK_STATE,
        `Cannot acknowledge cancellation for a task in status ${task.status}`,
      );
    }

    const transition = await performTaskTransition(ctx, {
      taskId: task._id,
      toStatus: "cancelled",
      progressMessage: "Cancelled by the Console Connector.",
    });
    await recordAudit(ctx, {
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "task_cancelled",
      conversationId: task.conversationId,
      taskId: task._id,
      connectorId: args.connectorId,
      now,
    });
    await clearConnectorCurrentTask(ctx, args.connectorId, task._id, now);

    return { taskId: transition.taskId, status: "cancelled" as const, cancelledAt: now, idempotent: false };
  },
});

/** Optional early release of a claim strictly before execution starts
 * (status still `claimed`). Returns the task to `queued`, preserving its
 * original `queueSequence` (fairness — it does not lose its place). */
export const releaseClaim = internalMutation({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
    const now = Date.now();
    requireLeaseOwnership(task, args.connectorId, args.leaseId, now);

    if (task.status !== "claimed") {
      nexusError(NEXUS_ERROR_CODES.INVALID_TASK_STATE, "Only a claimed (not yet started) task may be released");
    }

    const reasonSuffix = args.reason ? `: ${clampLength(args.reason, 200)}` : "";
    const transition = await performTaskTransition(ctx, {
      taskId: task._id,
      toStatus: "queued",
      progressMessage: clampLength(
        `Released by the Connector before starting${reasonSuffix}.`,
        P5_LIMITS.maxProgressMessageLength,
      ),
    });
    await recordAudit(ctx, {
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: "task_lease_recovered",
      conversationId: task.conversationId,
      taskId: task._id,
      connectorId: args.connectorId,
      now,
      metadata: { reason: args.reason ?? "connector_released" },
    });
    await clearConnectorCurrentTask(ctx, args.connectorId, task._id, now);

    return { taskId: transition.taskId, status: "queued" as const };
  },
});

/**
 * Stale-lease recovery. A task is stale when its status is
 * claimed/running/cancel_requested and `leaseExpiresAt` is in the past.
 * Policy (documented in `docs/specs/nexus_p6_trusted_connector_queue_protocol_v1.md`):
 *
 * - `claimed` (never started, no side effects possible): always safely
 *   requeued.
 * - `running`: requeued only if the tool's execution-safety class is
 *   `read_only_idempotent` (true of every P5 tool today) AND the task has
 *   not already been recovered `P6_LEASE.maxLeaseRecoveries` times;
 *   otherwise failed with a retryable `connector_lease_expired` error so the
 *   user can manually retry rather than the system silently re-running
 *   potentially side-effecting work forever.
 * - `cancel_requested`: finalized straight to `cancelled` — the user already
 *   asked to stop, so there is no ambiguity about intent.
 *
 * Bounded per call (default 20 per status); called opportunistically from
 * `claimNextTask` and on a schedule from `convex/crons.ts`.
 */
export async function recoverStaleLeasesBatch(
  ctx: MutationCtx,
  now: number,
  limitPerStatus = 20,
): Promise<{ recovered: number }> {
  let recovered = 0;
  for (const status of ["claimed", "running", "cancel_requested"] as const) {
    const stale = await ctx.db
      .query("nexusTasks")
      .withIndex("by_status_and_lease_expires_at", (q) => q.eq("status", status).lt("leaseExpiresAt", now))
      .take(limitPerStatus);
    for (const task of stale) {
      if (task.leaseExpiresAt === undefined || task.leaseExpiresAt >= now) continue; // defensive
      await recoverOneStaleTask(ctx, task, now);
      recovered += 1;
    }
  }
  return { recovered };
}

async function recoverOneStaleTask(ctx: MutationCtx, task: Doc<"nexusTasks">, now: number): Promise<void> {
  const connectorId = task.claimedByConnectorId;
  const recoveryCount = (task.recoveryCount ?? 0) + 1;

  let toStatus: TaskStatus;
  let progressMessage: string;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  if (task.status === "claimed") {
    toStatus = "queued";
    progressMessage = "Connector became unreachable before starting; task returned to the queue.";
  } else if (task.status === "running") {
    const safety = executionSafetyForTool(task.requestedToolId);
    if (safety === "read_only_idempotent" && recoveryCount <= P6_LEASE.maxLeaseRecoveries) {
      toStatus = "queued";
      progressMessage = "Connector became unreachable while running; task returned to the queue.";
    } else {
      toStatus = "failed";
      progressMessage = "Connector became unreachable; task failed and can be retried.";
      errorCode = "connector_lease_expired";
      errorMessage = "Connector became unreachable while this task was running.";
    }
  } else {
    toStatus = "cancelled";
    progressMessage = "Connector became unreachable; cancellation finalized.";
  }

  const fromStatus = task.status;
  await performTaskTransition(ctx, {
    taskId: task._id,
    toStatus,
    progressMessage,
    errorCode,
    errorMessage,
  });
  await ctx.db.patch(task._id, { recoveryCount, updatedAt: now });
  await recordAudit(ctx, {
    ownerClerkUserId: task.ownerClerkUserId,
    eventType: "task_lease_recovered",
    conversationId: task.conversationId,
    taskId: task._id,
    connectorId,
    now,
    metadata: { fromStatus, toStatus, recoveryCount },
  });

  if (connectorId) {
    await clearConnectorCurrentTask(ctx, connectorId, task._id, now);
  }
}

/** Scheduled entry point (see `convex/crons.ts`); also safe to run manually
 * via `npx convex run connectorTasks:recoverStaleLeases` for operator
 * maintenance. */
export const recoverStaleLeases = internalMutation({
  args: { limitPerStatus: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return recoverStaleLeasesBatch(ctx, now, args.limitPerStatus);
  },
});
