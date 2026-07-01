import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getActiveRolesForUser,
  requireApprovedUser,
  requireAuthenticatedIdentity,
} from "./auth";
import { NEXUS_ERROR_CODES, nexusError } from "./errors";
import type { NexusRole } from "./permissions";

/**
 * P5 ownership boundary.
 *
 * Every user-facing query and mutation derives ownership from the VERIFIED
 * Convex identity (`ctx.auth.getUserIdentity().subject`, the Clerk subject) and
 * never from a browser-supplied owner id, role, or email. The browser may pass
 * a document id, but Convex independently confirms the authenticated subject
 * owns that record before returning or modifying it.
 *
 * Cross-user access returns a generic `*_not_found` error — identical whether
 * the record is missing or owned by someone else — so existence never leaks.
 */

export type ApprovedActor = {
  clerkUserId: string;
  user: Doc<"approvedUsers">;
};

/** Authenticated + approved + active. The canonical entry point for P5 funcs. */
export async function getCurrentApprovedClerkUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<ApprovedActor> {
  const identity = await requireAuthenticatedIdentity(ctx);
  const user = await requireApprovedUser(ctx, identity.clerkUserId);
  return { clerkUserId: identity.clerkUserId, user };
}

/** Approved + active + holds a specific role (e.g. knowledge_reader). */
export async function requireApprovedRole(
  ctx: QueryCtx | MutationCtx,
  role: NexusRole,
): Promise<ApprovedActor> {
  const actor = await getCurrentApprovedClerkUserId(ctx);
  const roles = await getActiveRolesForUser(ctx, actor.clerkUserId);
  if (!roles.includes(role)) {
    nexusError(NEXUS_ERROR_CODES.ROLE_REQUIRED, "Required role not assigned");
  }
  return actor;
}

/** Convenience: the role every ordinary P5 user action requires. */
export function requireKnowledgeReader(
  ctx: QueryCtx | MutationCtx,
): Promise<ApprovedActor> {
  return requireApprovedRole(ctx, "knowledge_reader");
}

export async function requireOwnedConversation(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  conversationId: Id<"nexusConversations">,
): Promise<Doc<"nexusConversations">> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.ownerClerkUserId !== clerkUserId) {
    nexusError(NEXUS_ERROR_CODES.CONVERSATION_NOT_FOUND, "Conversation not found");
  }
  return conversation;
}

export async function requireOwnedTask(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  taskId: Id<"nexusTasks">,
): Promise<Doc<"nexusTasks">> {
  const task = await ctx.db.get(taskId);
  if (!task || task.ownerClerkUserId !== clerkUserId) {
    nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
  }
  return task;
}

export async function requireOwnedMessage(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  messageId: Id<"nexusMessages">,
): Promise<Doc<"nexusMessages">> {
  const message = await ctx.db.get(messageId);
  if (!message || message.ownerClerkUserId !== clerkUserId) {
    nexusError(NEXUS_ERROR_CODES.MESSAGE_NOT_FOUND, "Message not found");
  }
  return message;
}

export async function requireOwnedLibraryDocument(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  documentId: Id<"nexusLibraryDocuments">,
): Promise<Doc<"nexusLibraryDocuments">> {
  const document = await ctx.db.get(documentId);
  if (!document || document.ownerClerkUserId !== clerkUserId || document.status === "deleted") {
    nexusError(NEXUS_ERROR_CODES.LIBRARY_DOCUMENT_NOT_FOUND, "Document not found");
  }
  return document;
}

export async function requireOwnedLibraryVersion(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  versionId: Id<"nexusLibraryDocumentVersions">,
): Promise<Doc<"nexusLibraryDocumentVersions">> {
  const version = await ctx.db.get(versionId);
  if (!version || version.ownerClerkUserId !== clerkUserId || version.deletedAt) {
    nexusError(NEXUS_ERROR_CODES.LIBRARY_VERSION_NOT_FOUND, "Document version not found");
  }
  return version;
}

export async function requireOwnedScheduledEvent(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  eventId: Id<"nexusScheduledEvents">,
): Promise<Doc<"nexusScheduledEvents">> {
  const event = await ctx.db.get(eventId);
  if (
    !event ||
    event.ownerClerkUserId !== clerkUserId ||
    event.deletedAt ||
    event.hiddenFromCalendar
  ) {
    nexusError(NEXUS_ERROR_CODES.SCHEDULED_EVENT_NOT_FOUND, "Scheduled event not found");
  }
  return event;
}

/**
 * Defense-in-depth: a child record (message/task/source/result) must both be
 * owned by the caller AND belong to the conversation/task it claims to. Guards
 * against forged cross-record links even within a single owner.
 */
export function assertConversationTaskLink(
  conversation: Doc<"nexusConversations">,
  task: Doc<"nexusTasks">,
): void {
  if (task.conversationId !== conversation._id) {
    nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");
  }
}

export function assertTaskMessageLink(
  task: Doc<"nexusTasks">,
  message: Doc<"nexusMessages">,
): void {
  if (message.conversationId !== task.conversationId) {
    nexusError(NEXUS_ERROR_CODES.MESSAGE_NOT_FOUND, "Message not found");
  }
}
