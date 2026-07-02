// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { localDateTimeToUtcMs } from "@/convex/lib/calendarTimezone";
import {
  normalizeLabels,
  normalizeNoteInput,
  NOTES_LIMITS,
} from "@/convex/lib/notesConfig";
import {
  dueStateForNote,
  filterNotesBySearch,
  sortNotesForDisplay,
  type NexusNoteView,
} from "@/lib/nexus/notesView";
import { IDENTITY_A, IDENTITY_B, p5Test, seedApprovedReader } from "./helpers/convexP5";

function noteArgs(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test note",
    content: "Body text",
    noteType: "note" as const,
    checklistItems: [],
    labels: ["work"],
    pinned: false,
    due: { dueLocalDate: null, dueLocalTime: null, timezone: null },
    ...overrides,
  };
}

describe("Nexus Notes Convex authority", () => {
  it("requires auth and scopes notes to the owner", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const asA = t.withIdentity(IDENTITY_A);
    const asB = t.withIdentity(IDENTITY_B);

    const created = await asA.mutation(api.notes.createMyNote, noteArgs());
    const listed = await asA.query(api.notes.listMyNotes, { archived: false });
    expect(listed.some((note) => note.id === created.noteId)).toBe(true);

    const bList = await asB.query(api.notes.listMyNotes, { archived: false });
    expect(bList.some((note) => note.id === created.noteId)).toBe(false);

    await expect(
      asB.mutation(api.notes.updateMyNote, {
        noteId: created.noteId,
        ...noteArgs({ title: "Hijack" }),
      }),
    ).rejects.toThrow();
  });

  it("creates and edits plain notes and checklists", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asUser = t.withIdentity(IDENTITY_A);

    const plain = await asUser.mutation(api.notes.createMyNote, noteArgs());
    await asUser.mutation(api.notes.updateMyNote, {
      noteId: plain.noteId,
      ...noteArgs({ title: "Updated", content: "Updated body" }),
    });
    const plainRow = (await asUser.query(api.notes.listMyNotes, { archived: false })).find(
      (note) => note.id === plain.noteId,
    );
    expect(plainRow?.title).toBe("Updated");

    const checklist = await asUser.mutation(api.notes.createMyNote, {
      title: "Groceries",
      content: "",
      noteType: "checklist",
      checklistItems: [
        { id: "item-1", text: "Milk", completed: false, order: 0 },
        { id: "item-2", text: "Eggs", completed: false, order: 1 },
      ],
      labels: [],
      pinned: false,
      due: { dueLocalDate: null, dueLocalTime: null, timezone: null },
    });
    await asUser.mutation(api.notes.toggleMyChecklistItem, {
      noteId: checklist.noteId,
      itemId: "item-1",
      completed: true,
    });
    const checklistRow = (await asUser.query(api.notes.listMyNotes, { archived: false })).find(
      (note) => note.id === checklist.noteId,
    );
    expect(checklistRow?.checklistItems.find((item) => item.id === "item-1")?.completed).toBe(true);
  });

  it("pins, archives, deletes, and batches safely", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asUser = t.withIdentity(IDENTITY_A);
    const a = await asUser.mutation(api.notes.createMyNote, noteArgs({ title: "A" }));
    const b = await asUser.mutation(api.notes.createMyNote, noteArgs({ title: "B" }));

    await asUser.mutation(api.notes.setMyNotePinned, { noteId: a.noteId, pinned: true });
    await asUser.mutation(api.notes.setMyNotesArchived, {
      noteIds: [a.noteId, b.noteId],
      archived: true,
    });
    expect((await asUser.query(api.notes.listMyNotes, { archived: true }))).toHaveLength(2);
    expect((await asUser.query(api.notes.listMyNotes, { archived: false }))).toHaveLength(0);

    await asUser.mutation(api.notes.setMyNotesArchived, { noteIds: [a.noteId], archived: false });
    await asUser.mutation(api.notes.deleteMyNotes, { noteIds: [b.noteId] });
    const active = await asUser.query(api.notes.listMyNotes, { archived: false });
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(a.noteId);
  });

  it("rejects blank notes and normalizes labels", () => {
    expect(() =>
      normalizeNoteInput({
        title: "   ",
        content: "   ",
        noteType: "note",
        checklistItems: [],
        labels: [" Work ", "work", "WORK"],
        pinned: false,
        due: {},
      }),
    ).toThrow();

    expect(normalizeLabels([" Work ", "work", "", "a".repeat(100)])).toEqual(["Work", "a".repeat(50)]);
    expect(NOTES_LIMITS.maxLabels).toBe(20);
  });

  it("stores due dates as canonical UTC instants", () => {
    const normalized = normalizeNoteInput({
      title: "Due note",
      content: "",
      noteType: "note",
      checklistItems: [],
      labels: [],
      pinned: false,
      due: {
        dueLocalDate: "2026-06-15",
        dueLocalTime: "15:00",
        timezone: "America/New_York",
      },
    });
    expect(normalized.dueAtUtc).toBe(localDateTimeToUtcMs("2026-06-15", "15:00", "America/New_York"));
  });

  it("derives due/search/sort behavior without creating tasks", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const notes: NexusNoteView[] = [
      {
        id: "1",
        title: "Alpha",
        content: "find me",
        noteType: "note",
        checklistItems: [],
        labels: ["work"],
        pinned: false,
        archived: false,
        dueAtUtc: now + 2 * 24 * 60 * 60 * 1000,
        dueLocalDate: null,
        dueLocalTime: null,
        timezone: null,
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
      },
      {
        id: "2",
        title: "Pinned",
        content: "",
        noteType: "checklist",
        checklistItems: [{ id: "c1", text: "buy milk", completed: false, order: 0 }],
        labels: [],
        pinned: true,
        archived: false,
        dueAtUtc: now - 60_000,
        dueLocalDate: null,
        dueLocalTime: null,
        timezone: null,
        createdAt: 2,
        updatedAt: 2,
        archivedAt: null,
      },
    ];
    expect(dueStateForNote(notes[1]!, now)).toBe("overdue");
    expect(filterNotesBySearch(notes, "milk")).toHaveLength(1);
    expect(sortNotesForDisplay(notes)[0]?.id).toBe("2");
  });
});
