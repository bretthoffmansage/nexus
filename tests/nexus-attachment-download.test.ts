// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIBRARY_DROPZONE_TOOL_ID } from "@/convex/lib/libraryDropzoneConfig";
import { sha256HexFromBytes } from "@/convex/lib/librarySha256";
import { IDENTITY_A, p5Test, seedApprovedAdmin, type P5Test } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  fetchSigned,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

const ATTACHMENT_PATH = "/api/connector/v1/attachment";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

async function seedLibraryVersion(
  t: P5Test,
  bytes: Uint8Array,
  filename = "doc.md",
  contentType = "text/markdown",
) {
  const sha256 = await sha256HexFromBytes(bytes.buffer as ArrayBuffer);
  return t.run(async (ctx) => {
    const now = Date.now();
    const documentId = await ctx.db.insert("nexusLibraryDocuments", {
      ownerClerkUserId: IDENTITY_A.subject,
      displayName: filename,
      status: "active",
      versionCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(new Blob([bytes.buffer as ArrayBuffer], { type: contentType }));
    const versionId = await ctx.db.insert("nexusLibraryDocumentVersions", {
      documentId,
      ownerClerkUserId: IDENTITY_A.subject,
      versionNumber: 1,
      originalFilename: filename,
      displayFilename: filename,
      contentType,
      fileExtension: ".md",
      byteLength: bytes.byteLength,
      sha256,
      storageId,
      uploadedAt: now,
      processingStatus: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(documentId, { latestVersionId: versionId });
    return { documentVersionId: versionId, sha256, byteLength: bytes.byteLength };
  });
}

async function claimStartedLibraryTask(t: P5Test, bytes: Uint8Array) {
  await seedApprovedAdmin(t, IDENTITY_A);
  await seedConnector(t, { allowedToolIds: [LIBRARY_DROPZONE_TOOL_ID] });
  const uploaded = await seedLibraryVersion(t, bytes);
  const proc = await t.withIdentity(IDENTITY_A).mutation(api.libraryDocuments.processMyDocumentVersion, {
    documentVersionId: uploaded.documentVersionId,
  });
  const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
    connectorId: TEST_CONNECTOR_ID,
  });
  expect(claim.status).toBe("claimed");
  const taskId = claim.task!.taskId as Id<"nexusTasks">;
  const leaseId = claim.task!.leaseId!;
  const attachmentId = claim.task!.attachments![0]!.attachmentId;
  await t.mutation(internal.connectorTasks.startTask, {
    connectorId: TEST_CONNECTOR_ID,
    taskId,
    leaseId,
  });
  return { taskId, leaseId, attachmentId, sha256: uploaded.sha256, byteLength: uploaded.byteLength };
}

describe("Nexus signed attachment download route", () => {
  it("returns exact bytes and protocol headers for an active lease", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("x".repeat(1352));
    const { taskId, leaseId, attachmentId, sha256, byteLength } = await claimStartedLibraryTask(
      t,
      content,
    );

    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: { action: "download", taskId, leaseId, attachmentId },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("x-nexus-attachment-id")).toBe(attachmentId);
    expect(res.headers.get("x-nexus-content-sha256")).toBe(sha256);
    // Canonical v1.1 length contract: the custom header is authoritative
    // because the deployed edge may deliver the body chunked WITHOUT a
    // standard Content-Length (convex-test preserves it; production does
    // not for larger bodies — the 2026-07-01 1701-byte live failure).
    expect(res.headers.get("x-nexus-content-length")).toBe(String(byteLength));
    expect(res.headers.get("x-nexus-protocol-version")).toBe("v1");
    expect(res.headers.get("x-nexus-document-version-id")).toBeTruthy();
    expect(res.headers.get("x-nexus-request-id")).toBeTruthy();
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(byteLength);
    expect(await sha256HexFromBytes(body.buffer as ArrayBuffer)).toBe(sha256);
  });

  it("attachmentSuccessHeaders emits the full canonical v1.1 contract", async () => {
    const { attachmentSuccessHeaders, ATTACHMENT_RESPONSE_HEADER_CONTRACT } = await import(
      "@/convex/connectorAttachments"
    );
    const headers = attachmentSuccessHeaders({
      attachmentId: "att-contract",
      documentVersionId: "ver-contract" as never,
      contentType: "text/markdown",
      displayFilename: "doc.md",
      byteLength: 1701,
      sha256: "ab".repeat(32),
      requestId: "req-contract",
    });
    for (const name of ATTACHMENT_RESPONSE_HEADER_CONTRACT) {
      expect(headers[name], `missing contract header ${name}`).toBeTruthy();
    }
    // Both length representations agree; the custom one survives chunked
    // delivery and is what the Connector validates.
    expect(headers["X-Nexus-Content-Length"]).toBe("1701");
    expect(headers["Content-Length"]).toBe("1701");
    expect(headers["X-Nexus-Content-Sha256"]).toBe("ab".repeat(32));
    expect(headers["X-Nexus-Protocol-Version"]).toBe("v1");
  });

  it("rejects invalid HMAC signatures", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("signed");
    const { taskId, leaseId, attachmentId } = await claimStartedLibraryTask(t, content);
    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: { action: "download", taskId, leaseId, attachmentId },
      overrideSignature: "a".repeat(64),
    });
    expect(res.status).toBe(401);
    const parsed = (await res.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("invalid_signature");
  });

  it("rejects wrong lease binding", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("lease");
    const { taskId, attachmentId } = await claimStartedLibraryTask(t, content);
    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: {
        action: "download",
        taskId,
        leaseId: "00000000-0000-4000-8000-000000000000",
        attachmentId,
      },
    });
    expect(res.status).toBe(409);
    const parsed = (await res.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("wrong_lease");
  });

  it("rejects attachment not bound to the task", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("bound");
    const { taskId, leaseId } = await claimStartedLibraryTask(t, content);
    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: {
        action: "download",
        taskId,
        leaseId,
        attachmentId: "00000000-0000-4000-8000-000000000099",
      },
    });
    expect(res.status).toBe(404);
    const parsed = (await res.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("attachment_not_bound");
  });

  it("rejects expired leases", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("expired");
    const { taskId, leaseId, attachmentId } = await claimStartedLibraryTask(t, content);
    await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { leaseExpiresAt: Date.now() - 1_000 });
    });
    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: { action: "download", taskId, leaseId, attachmentId },
    });
    expect(res.status).toBe(409);
    const parsed = (await res.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("lease_expired");
  });

  it("returns storage unavailable when the blob is missing", async () => {
    const t = p5Test();
    const content = new TextEncoder().encode("missing blob case");
    const { taskId, leaseId, attachmentId } = await claimStartedLibraryTask(t, content);
    await t.run(async (ctx) => {
      const attachment = await ctx.db
        .query("nexusTaskAttachments")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .unique();
      if (!attachment) throw new Error("attachment_missing");
      const orphan = await ctx.storage.store(new Blob(["orphan"], { type: "text/plain" }));
      await ctx.storage.delete(orphan);
      await ctx.db.patch(attachment._id, { storageId: orphan });
    });
    const res = await fetchSigned(t, {
      path: ATTACHMENT_PATH,
      body: { action: "download", taskId, leaseId, attachmentId },
    });
    expect(res.status).toBe(404);
    const parsed = (await res.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("attachment_storage_unavailable");
  });

  it("library re-process creates a fresh attachment row bound to the new task", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_A);
    const bytes = new TextEncoder().encode("# retry document\n".repeat(40));
    const uploaded = await seedLibraryVersion(t, bytes);
    const first = await t.withIdentity(IDENTITY_A).mutation(api.libraryDocuments.processMyDocumentVersion, {
      documentVersionId: uploaded.documentVersionId,
    });
    const firstAttachment = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTaskAttachments")
        .withIndex("by_task", (q) => q.eq("taskId", first.taskId))
        .unique(),
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(first.taskId, { status: "failed", failedAt: Date.now() });
    });

    const second = await t.withIdentity(IDENTITY_A).mutation(api.libraryDocuments.processMyDocumentVersion, {
      documentVersionId: uploaded.documentVersionId,
    });
    expect(second.taskId).not.toBe(first.taskId);

    const secondAttachment = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTaskAttachments")
        .withIndex("by_task", (q) => q.eq("taskId", second.taskId))
        .unique(),
    );
    expect(secondAttachment?.attachmentId).not.toBe(firstAttachment?.attachmentId);
    expect(secondAttachment?.taskId).toBe(second.taskId);
    expect(secondAttachment?.storageId).toBe(firstAttachment?.storageId);
  });
});

describe("Attachment authorization stays out of storage queries", () => {
  it("authorizeAttachmentDownload source does not call storage.getMetadata", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(process.cwd(), "convex/connectorAttachments.ts"),
      "utf8",
    );
    expect(src).not.toContain("storage.getMetadata");
    expect(src).not.toContain("storage.get(");
  });
});
