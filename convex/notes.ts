import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  normalizeNoteInput,
  NOTES_LIMITS,
  type ChecklistItem,
  type NoteType,
} from "./lib/notesConfig";
import { requireKnowledgeReader, requireOwnedNote } from "./lib/ownership";

const checklistItemValidator = v.object({
  id: v.string(),
  text: v.string(),
  completed: v.boolean(),
  order: v.number(),
});

const dueInputValidator = v.object({
  dueLocalDate: v.optional(v.union(v.string(), v.null())),
  dueLocalTime: v.optional(v.union(v.string(), v.null())),
  timezone: v.optional(v.union(v.string(), v.null())),
});

const noteContentArgs = {
  title: v.string(),
  content: v.string(),
  noteType: v.union(v.literal("note"), v.literal("checklist")),
  checklistItems: v.array(checklistItemValidator),
  labels: v.array(v.string()),
  pinned: v.optional(v.boolean()),
  due: dueInputValidator,
};

function mapNoteValidationError(error: unknown): never {
  const message = error instanceof Error ? error.message : "invalid_note";
  if (message === "blank_note" || message === "blank_checklist") {
    nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Note cannot be empty");
  }
  if (message === "invalid_due_datetime") {
    nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Invalid due date or time");
  }
  nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Invalid note");
}

function buildNormalized(input: {
  title: string;
  content: string;
  noteType: NoteType;
  checklistItems: ChecklistItem[];
  labels: string[];
  pinned?: boolean;
  due: {
    dueLocalDate?: string | null;
    dueLocalTime?: string | null;
    timezone?: string | null;
  };
}) {
  try {
    return normalizeNoteInput({
      title: input.title,
      content: input.content,
      noteType: input.noteType,
      checklistItems: input.checklistItems,
      labels: input.labels,
      pinned: input.pinned ?? false,
      due: input.due,
    });
  } catch (error) {
    mapNoteValidationError(error);
  }
}

function projectNote(doc: Doc<"nexusNotes">) {
  return {
    id: doc._id,
    title: doc.title,
    content: doc.content,
    noteType: doc.noteType,
    checklistItems: doc.checklistItems,
    labels: doc.labels,
    pinned: doc.pinned,
    archived: doc.archived,
    dueAtUtc: doc.dueAtUtc ?? null,
    dueLocalDate: doc.dueLocalDate ?? null,
    dueLocalTime: doc.dueLocalTime ?? null,
    timezone: doc.timezone ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    archivedAt: doc.archivedAt ?? null,
  };
}

/** List the caller's notes in the active or archived view. */
export const listMyNotes = query({
  args: {
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const rows = await ctx.db
      .query("nexusNotes")
      .withIndex("by_owner_and_archived_and_updated_at", (q) =>
        q.eq("ownerClerkUserId", clerkUserId).eq("archived", args.archived),
      )
      .order("desc")
      .collect();
    return rows.map(projectNote);
  },
});

/** Create a private note or checklist. */
export const createMyNote = mutation({
  args: noteContentArgs,
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const normalized = buildNormalized({
      ...args,
      pinned: args.pinned,
    });
    const now = Date.now();
    const noteId = await ctx.db.insert("nexusNotes", {
      ownerClerkUserId: clerkUserId,
      title: normalized.title,
      content: normalized.content,
      noteType: normalized.noteType,
      checklistItems: normalized.checklistItems,
      labels: normalized.labels,
      pinned: normalized.pinned,
      archived: false,
      dueAtUtc: normalized.dueAtUtc ?? undefined,
      dueLocalDate: normalized.dueLocalDate ?? undefined,
      dueLocalTime: normalized.dueLocalTime ?? undefined,
      timezone: normalized.timezone ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { noteId };
  },
});

/** Update an owned note. */
export const updateMyNote = mutation({
  args: {
    noteId: v.id("nexusNotes"),
    ...noteContentArgs,
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedNote(ctx, clerkUserId, args.noteId);
    const normalized = buildNormalized({
      title: args.title,
      content: args.content,
      noteType: args.noteType,
      checklistItems: args.checklistItems,
      labels: args.labels,
      pinned: args.pinned,
      due: args.due,
    });
    const now = Date.now();
    await ctx.db.patch(args.noteId, {
      title: normalized.title,
      content: normalized.content,
      noteType: normalized.noteType,
      checklistItems: normalized.checklistItems,
      labels: normalized.labels,
      pinned: normalized.pinned,
      dueAtUtc: normalized.dueAtUtc ?? undefined,
      dueLocalDate: normalized.dueLocalDate ?? undefined,
      dueLocalTime: normalized.dueLocalTime ?? undefined,
      timezone: normalized.timezone ?? undefined,
      updatedAt: now,
    });
    return { noteId: args.noteId, updatedAt: now };
  },
});

/** Toggle pin on an owned note. */
export const setMyNotePinned = mutation({
  args: {
    noteId: v.id("nexusNotes"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedNote(ctx, clerkUserId, args.noteId);
    const now = Date.now();
    await ctx.db.patch(args.noteId, { pinned: args.pinned, updatedAt: now });
    return { noteId: args.noteId, pinned: args.pinned };
  },
});

/** Archive or unarchive owned notes in one bounded batch. */
export const setMyNotesArchived = mutation({
  args: {
    noteIds: v.array(v.id("nexusNotes")),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    if (args.noteIds.length === 0) {
      return { updated: 0 };
    }
    if (args.noteIds.length > NOTES_LIMITS.maxBatchSize) {
      nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Too many notes in one request");
    }
    const now = Date.now();
    for (const noteId of args.noteIds) {
      await requireOwnedNote(ctx, clerkUserId, noteId);
      await ctx.db.patch(noteId, {
        archived: args.archived,
        archivedAt: args.archived ? now : undefined,
        updatedAt: now,
      });
    }
    return { updated: args.noteIds.length };
  },
});

/** Hard-delete owned notes in one bounded batch. */
export const deleteMyNotes = mutation({
  args: {
    noteIds: v.array(v.id("nexusNotes")),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    if (args.noteIds.length === 0) {
      return { deleted: 0 };
    }
    if (args.noteIds.length > NOTES_LIMITS.maxBatchSize) {
      nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Too many notes in one request");
    }
    for (const noteId of args.noteIds) {
      await requireOwnedNote(ctx, clerkUserId, noteId);
      await ctx.db.delete(noteId);
    }
    return { deleted: args.noteIds.length };
  },
});

/** Toggle one checklist item on an owned checklist note. */
export const toggleMyChecklistItem = mutation({
  args: {
    noteId: v.id("nexusNotes"),
    itemId: v.string(),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const note = await requireOwnedNote(ctx, clerkUserId, args.noteId);
    if (note.noteType !== "checklist") {
      nexusError(NEXUS_ERROR_CODES.NOTE_INVALID, "Not a checklist note");
    }
    const items = note.checklistItems.map((item) =>
      item.id === args.itemId ? { ...item, completed: args.completed } : item,
    );
    if (!items.some((item) => item.id === args.itemId)) {
      nexusError(NEXUS_ERROR_CODES.NOTE_NOT_FOUND, "Checklist item not found");
    }
    const now = Date.now();
    await ctx.db.patch(args.noteId, { checklistItems: items, updatedAt: now });
    return { noteId: args.noteId, updatedAt: now };
  },
});
