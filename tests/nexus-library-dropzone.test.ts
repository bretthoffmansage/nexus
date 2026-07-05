// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  LIBRARY_DROPZONE_TOOL_ID,
  LIBRARY_MAX_UPLOAD_BYTES,
} from "@/convex/lib/libraryDropzoneConfig";
import { sha256HexFromBytes } from "@/convex/lib/librarySha256";
import { IDENTITY_A, IDENTITY_B, p5Test, seedApprovedReader, type P5Test } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

async function seedLibraryVersion(
  t: P5Test,
  identity: { subject: string; email: string },
  filename: string,
  bytes: Uint8Array,
  contentType = "text/plain",
  processingStatus: "uploaded" | "unsupported" = "uploaded",
) {
  const sha256 = await sha256HexFromBytes(bytes.buffer as ArrayBuffer);
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  return t.run(async (ctx) => {
    const now = Date.now();
    const documentId = await ctx.db.insert("nexusLibraryDocuments", {
      ownerClerkUserId: identity.subject,
      displayName: filename,
      status: "active",
      versionCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(new Blob([bytes.buffer as ArrayBuffer], { type: contentType }));
    const versionId = await ctx.db.insert("nexusLibraryDocumentVersions", {
      documentId,
      ownerClerkUserId: identity.subject,
      versionNumber: 1,
      originalFilename: filename,
      displayFilename: filename,
      contentType,
      fileExtension: ext,
      byteLength: bytes.byteLength,
      sha256,
      storageId,
      uploadedAt: now,
      processingStatus,
      unsupportedReason:
        processingStatus === "unsupported"
          ? "Format is not supported for remote Dropzone processing."
          : undefined,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(documentId, { latestVersionId: versionId });
    return { documentId, documentVersionId: versionId, processingStatus };
  });
}

async function processVersion(
  t: P5Test,
  identity: { subject: string; email: string },
  documentVersionId: Id<"nexusLibraryDocumentVersions">,
) {
  return t.withIdentity(identity).mutation(api.libraryDocuments.processMyDocumentVersion, {
    documentVersionId,
  });
}

describe("Nexus Library Dropzone upload and attachment protocol", () => {
  it("authenticated upload finalization creates an immutable version with digest", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const content = new TextEncoder().encode("hello dropzone");
    const result = await seedLibraryVersion(t, IDENTITY_A, "note.txt", content);
    expect(result.processingStatus).toBe("uploaded");

    const versions = await t
      .withIdentity(IDENTITY_A)
      .query(api.libraryDocuments.listMyLibraryVersions, { statusFilter: "uploaded" });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.byteLength).toBe(content.byteLength);
    expect(versions[0]?.sha256).toBe(await sha256HexFromBytes(content.buffer as ArrayBuffer));
  });

  it("rejects unsupported and denied extensions", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const zip = await seedLibraryVersion(t, IDENTITY_A, "bad.zip", new Uint8Array([1, 2, 3]), "application/zip", "unsupported");
    expect(zip.processingStatus).toBe("unsupported");
    const key = await seedLibraryVersion(t, IDENTITY_A, "deck.key", new Uint8Array([1]), "application/octet-stream", "unsupported");
    expect(key.processingStatus).toBe("unsupported");
  });

  it("rejects oversized uploads at finalization", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(16)])),
    );
    const sha256 = await sha256HexFromBytes(new Uint8Array(16).buffer);
    await expect(
      t.mutation(internal.libraryDocuments.finalizeUploadRecord, {
        clerkUserId: IDENTITY_A.subject,
        storageId,
        originalFilename: "big.bin",
        contentType: "application/octet-stream",
        byteLength: LIBRARY_MAX_UPLOAD_BYTES + 1,
        sha256,
      }),
    ).rejects.toMatchObject({ data: { code: "library_upload_too_large" } });
  });

  it("process creates one nexusTasks row with dropzone tool and metadata", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID, "vault.agentic_retrieval"],
    });
    const content = new TextEncoder().encode("process me");
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "doc.md", content, "text/markdown");
    const proc = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    expect(proc.alreadyActive).toBe(false);

    const task = await t.run(async (ctx) => ctx.db.get(proc.taskId as Id<"nexusTasks">));
    expect(task?.requestedToolId).toBe(LIBRARY_DROPZONE_TOOL_ID);
    expect(task?.taskKind).toBe("library_document_processing");
    expect(task?.conversationId).toBeUndefined();
    expect(task?.requestText).toContain("doc.md");
    expect(task?.requestText).not.toContain("storage");
    expect(task?.taskMetadata?.idempotencyKey).toContain(":");

    const attachment = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTaskAttachments")
        .withIndex("by_task", (q) => q.eq("taskId", proc.taskId))
        .unique(),
    );
    expect(attachment?.sha256).toBe(await sha256HexFromBytes(content.buffer as ArrayBuffer));
  });

  it("duplicate process returns the existing active task", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "dup.txt", new TextEncoder().encode("x"));
    const first = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    const second = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    expect(second.taskId).toBe(first.taskId);
    expect(second.alreadyActive).toBe(true);

    const tasks = await t.run(async (ctx) =>
      ctx.db.query("nexusTasks").collect(),
    );
    expect(tasks.filter((row) => row.libraryDocumentVersionId === uploaded.documentVersionId)).toHaveLength(1);
  });

  it("claim includes attachment descriptor without bytes or owner id", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID] });
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "claim.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf");
    await processVersion(t, IDENTITY_A, uploaded.documentVersionId);

    const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(claim.status).toBe("claimed");
    expect(claim.task?.attachments).toHaveLength(1);
    expect(claim.task?.attachments?.[0]?.downloadPath).toBe("/api/connector/v1/attachment");
    expect(claim.task?.attachments?.[0]?.sha256).toHaveLength(64);
    expect(JSON.stringify(claim.task)).not.toMatch(/ownerClerkUserId/);
  });

  it("text-only chat claim remains backward compatible", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "plain chat task",
      idempotencyKey: "idem-chat-0001",
    });
    const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(claim.task?.attachments).toBeUndefined();
    expect(claim.task?.requestText).toBe("plain chat task");
  });

  it("user cannot read or process another user's version", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "private.txt", new TextEncoder().encode("secret"));
    await expect(
      t.withIdentity(IDENTITY_B).query(api.libraryDocuments.listMyLibraryVersions, {}),
    ).resolves.toHaveLength(0);
    await expect(
      processVersion(t, IDENTITY_B, uploaded.documentVersionId),
    ).rejects.toMatchObject({ data: { code: "library_version_not_found" } });
  });

  it("terminal dropzone result projects library status idempotently", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID] });
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "done.md", new TextEncoder().encode("# hi"), "text/markdown");
    const proc = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    const claim = await t.mutation(internal.connectorTasks.claimNextTask, { connectorId: TEST_CONNECTOR_ID });
    const leaseId = claim.task!.leaseId!;
    await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
    });
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      answerText: "Processed successfully.",
      dropzoneResult: {
        processingDisposition: "processed",
        userSafeMessage: "Document processed.",
        notesCreated: 2,
        vaultLocatorCount: 2,
      },
    });
    const version = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(version?.processingStatus).toBe("processed");
    expect(version?.notesCreatedCount).toBe(2);

    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      answerText: "Processed successfully.",
      dropzoneResult: {
        processingDisposition: "processed",
        userSafeMessage: "Document processed.",
        notesCreated: 99,
      },
    });
    const again = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(again?.notesCreatedCount).toBe(2);
  });

  it("uses only the canonical nexusTasks queue", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const uploaded = await seedLibraryVersion(t, IDENTITY_A, "q.txt", new TextEncoder().encode("q"));
    const proc = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    const task = await t.run(async (ctx) => ctx.db.get(proc.taskId as Id<"nexusTasks">));
    expect(task?.queueSequence).toBeGreaterThan(0);
    const counter = await t.run(async (ctx) =>
      ctx.db.query("nexusQueueCounter").withIndex("by_key", (q) => q.eq("key", "global")).unique(),
    );
    expect(counter?.value).toBeGreaterThan(0);
  });
});

describe("Nexus Library status projection lifecycle", () => {
  async function runToProcessing(t: P5Test) {
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID] });
    const uploaded = await seedLibraryVersion(
      t,
      IDENTITY_A,
      "lifecycle.md",
      new TextEncoder().encode("# lifecycle"),
      "text/markdown",
    );
    const proc = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);

    const queued = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(queued?.processingStatus).toBe("queued");
    expect(queued?.progressMessage).toBe("Queued for Dropzone processing.");

    const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    const leaseId = claim.task!.leaseId!;
    await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
    });
    const running = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(running?.processingStatus).toBe("processing");
    expect(running?.progressMessage).toBe("Processing document.");

    await t.mutation(internal.connectorTasks.appendConnectorProgress, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      stage: "analyzing",
      message: "Analyzing document",
    });
    const analyzing = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(analyzing?.progressMessage).toBe("Analyzing document");
    expect(analyzing?.processingStatus).toBe("processing");

    return { uploaded, proc, leaseId };
  }

  it("advances progress lines and clears them when processing succeeds", async () => {
    const t = p5Test();
    const { uploaded, proc, leaseId } = await runToProcessing(t);

    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      answerText: "Document processed into the vault.",
      dropzoneResult: {
        processingDisposition: "processed",
        userSafeMessage: "Document processed into the vault.",
        notesCreated: 3,
        vaultLocatorCount: 3,
        warnings: ["placement_verified"],
      },
    });

    const done = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(done?.processingStatus).toBe("processed");
    expect(done?.progressMessage).toBeUndefined();
    expect(done?.terminalSummary).toBe("Document processed into the vault.");
    expect(done?.terminalDisposition).toBe("processed");
    expect(done?.notesCreatedCount).toBe(3);
    expect(done?.vaultLocatorCount).toBe(3);
  });

  it("projects a blocked run as needs_review with the cause, not a stale progress line", async () => {
    const t = p5Test();
    const { uploaded, proc, leaseId } = await runToProcessing(t);

    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      answerText: "Document processing stopped before vault placement.",
      dropzoneResult: {
        processingDisposition: "blocked",
        userSafeMessage: "Document processing stopped before vault placement.",
        notesCreated: 0,
        vaultLocatorCount: 0,
        warnings: ["dropzone_root_refused_as_execution_root"],
        retryable: true,
      },
    });

    const done = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(done?.processingStatus).toBe("needs_review");
    expect(done?.progressMessage).toBeUndefined();
    expect(done?.terminalSummary).toBe(
      "Document processing stopped before vault placement.",
    );
    expect(done?.terminalWarnings).toContain("dropzone_root_refused_as_execution_root");
    expect(done?.terminalRetryable).toBe(true);
    expect(done?.notesCreatedCount).toBe(0);

    const rows = await t
      .withIdentity(IDENTITY_A)
      .query(api.libraryDocuments.listMyLibraryVersions, {});
    const row = rows.find((r) => r.documentVersionId === uploaded.documentVersionId);
    expect(row?.terminalWarnings).toContain("dropzone_root_refused_as_execution_root");
    expect(row?.progressMessage).toBeUndefined();
  });
});

describe("Nexus Library retry of blocked runs", () => {
  it("allows reprocessing a needs_review version whose stop was retryable", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID] });
    const uploaded = await seedLibraryVersion(
      t,
      IDENTITY_A,
      "retry.md",
      new TextEncoder().encode("# retry me"),
      "text/markdown",
    );
    const proc = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    const leaseId = claim.task!.leaseId!;
    await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
    });
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId: proc.taskId,
      leaseId,
      answerText: "Document processing stopped before vault placement.",
      dropzoneResult: {
        processingDisposition: "blocked",
        userSafeMessage: "Document processing stopped before vault placement.",
        retryable: true,
      },
    });

    const blocked = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(blocked?.processingStatus).toBe("needs_review");
    expect(blocked?.terminalRetryable).toBe(true);

    const retry = await processVersion(t, IDENTITY_A, uploaded.documentVersionId);
    expect(retry.taskId).toBeDefined();
    const requeued = await t.run(async (ctx) => ctx.db.get(uploaded.documentVersionId));
    expect(requeued?.processingStatus).toBe("queued");
  });

  it("still rejects reprocessing for processed and non-retryable needs_review versions", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const uploaded = await seedLibraryVersion(
      t,
      IDENTITY_A,
      "locked.md",
      new TextEncoder().encode("# locked"),
      "text/markdown",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(uploaded.documentVersionId, {
        processingStatus: "needs_review",
        terminalRetryable: false,
      });
    });
    await expect(
      processVersion(t, IDENTITY_A, uploaded.documentVersionId),
    ).rejects.toMatchObject({ data: { code: "library_process_not_allowed" } });

    await t.run(async (ctx) => {
      await ctx.db.patch(uploaded.documentVersionId, { processingStatus: "processed" });
    });
    await expect(
      processVersion(t, IDENTITY_A, uploaded.documentVersionId),
    ).rejects.toMatchObject({ data: { code: "library_process_not_allowed" } });
  });
});
