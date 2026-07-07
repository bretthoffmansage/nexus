// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIBRARY_DROPZONE_TOOL_ID } from "@/convex/lib/libraryDropzoneConfig";
import { sha256HexFromBytes } from "@/convex/lib/librarySha256";
import { IDENTITY_A, key, p5Test, seedApprovedAdmin, type P5Test } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

const READ_ONLY_TOOL_IDS = ["vault.agentic_retrieval", "membership_io.transcript_retrieve"];
const FULL_TOOL_IDS = [...READ_ONLY_TOOL_IDS, LIBRARY_DROPZONE_TOOL_ID];

async function setAllowedTools(t: P5Test, connectorId: string, allowedToolIds: string[]) {
  return t.mutation(internal.connectorRegistry.setConnectorAllowedTools, {
    connectorId,
    allowedToolIds,
  });
}

async function claim(t: P5Test, connectorId = TEST_CONNECTOR_ID) {
  return t.mutation(internal.connectorTasks.claimNextTask, { connectorId });
}

/** Upload + explicit Process → one queued Dropzone task, exactly like the UI path. */
async function queueDropzoneTask(t: P5Test): Promise<Id<"nexusTasks">> {
  const bytes = new TextEncoder().encode("# staged document");
  const sha256 = await sha256HexFromBytes(bytes.buffer as ArrayBuffer);
  const versionId = await t.run(async (ctx) => {
    const now = Date.now();
    const documentId = await ctx.db.insert("nexusLibraryDocuments", {
      ownerClerkUserId: IDENTITY_A.subject,
      displayName: "doc.md",
      status: "active",
      versionCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob([bytes.buffer as ArrayBuffer], { type: "text/markdown" }),
    );
    const id = await ctx.db.insert("nexusLibraryDocumentVersions", {
      documentId,
      ownerClerkUserId: IDENTITY_A.subject,
      versionNumber: 1,
      originalFilename: "doc.md",
      displayFilename: "doc.md",
      contentType: "text/markdown",
      fileExtension: ".md",
      byteLength: bytes.byteLength,
      sha256,
      storageId,
      uploadedAt: now,
      processingStatus: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(documentId, { latestVersionId: id });
    return id;
  });
  const proc = await t
    .withIdentity(IDENTITY_A)
    .mutation(api.libraryDocuments.processMyDocumentVersion, { documentVersionId: versionId });
  return proc.taskId as Id<"nexusTasks">;
}

describe("P6 Connector allowed-tools administrative update", () => {
  it("reproduces the field failure: a pre-Dropzone allowlist skips the queued Library task", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_A);
    // Connector bootstrapped before the Dropzone tool existed.
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    await queueDropzoneTask(t);

    const result = await claim(t);
    expect(result.status).toBe("idle");
    expect(result.task).toBeNull();
  });

  it("setConnectorAllowedTools makes the SAME queued task claimable without recreation", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    const taskId = await queueDropzoneTask(t);
    expect((await claim(t)).status).toBe("idle");

    const update = await setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS);
    expect(update.changed).toBe(true);
    expect(update.allowedToolIds).toEqual(FULL_TOOL_IDS);

    const result = await claim(t);
    expect(result.status).toBe("claimed");
    expect(result.task?.taskId).toBe(taskId);
    expect(result.task?.requestedToolId).toBe(LIBRARY_DROPZONE_TOOL_ID);
    expect(result.task?.attachments).toHaveLength(1);
  });

  it("is idempotent: repeating the identical update changes nothing", async () => {
    const t = p5Test();
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    const first = await setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS);
    expect(first.changed).toBe(true);
    const second = await setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS);
    expect(second.changed).toBe(false);
    expect(second.allowedToolIds).toEqual(FULL_TOOL_IDS);

    const rows = await t.run(async (ctx) => ctx.db.query("nexusConnectors").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.allowedToolIds).toEqual(FULL_TOOL_IDS);
  });

  it("preserves identity, status, and lifecycle fields", async () => {
    const t = p5Test();
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    const before = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    await setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS);
    const after = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(after?.connectorId).toBe(before?.connectorId);
    expect(after?.displayName).toBe(before?.displayName);
    expect(after?.status).toBe("active");
    expect(after?.enabled).toBe(true);
    expect(after?.allowedCapabilities).toEqual(before?.allowedCapabilities);
    expect(after?.createdAt).toBe(before?.createdAt);
  });

  it("still claims read-only tools after the update, honoring global queue order", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    // Chat task queued FIRST, Dropzone task second.
    const chat = await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "ordinary chat question",
      idempotencyKey: key("order1"),
    });
    await queueDropzoneTask(t);
    await setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS);

    // The older chat task wins — capability repair does not jump the queue.
    const first = await claim(t);
    expect(first.task?.taskId).toBe(chat.taskId);
    expect(first.task?.requestedToolId).toBe("vault.agentic_retrieval");
  });

  it("rejects unknown tool ids and wildcards — no broad write authority", async () => {
    const t = p5Test();
    await seedConnector(t);
    await expect(setAllowedTools(t, TEST_CONNECTOR_ID, ["*"])).rejects.toThrow(/Unknown tool id/);
    await expect(
      setAllowedTools(t, TEST_CONNECTOR_ID, ["obsidian.vault.write_note"]),
    ).rejects.toThrow(/Unknown tool id/);
    await expect(
      setAllowedTools(t, TEST_CONNECTOR_ID, [...FULL_TOOL_IDS, "evil.tool"]),
    ).rejects.toThrow(/Unknown tool id/);
    await expect(setAllowedTools(t, TEST_CONNECTOR_ID, [])).rejects.toThrow(/must not be empty/);
  });

  it("rejects unknown and revoked Connectors", async () => {
    const t = p5Test();
    await expect(setAllowedTools(t, "no-such-connector", FULL_TOOL_IDS)).rejects.toThrow(
      /not found/,
    );
    await seedConnector(t);
    await t.mutation(internal.connectorRegistry.setConnectorStatus, {
      connectorId: TEST_CONNECTOR_ID,
      status: "revoked",
    });
    await expect(setAllowedTools(t, TEST_CONNECTOR_ID, FULL_TOOL_IDS)).rejects.toThrow(/revoked/);
  });

  it("a Connector still lacking the Dropzone capability cannot claim the Library task", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_A);
    await seedConnector(t, { allowedToolIds: FULL_TOOL_IDS });
    await seedConnector(t, { connectorId: "connector-readonly", allowedToolIds: READ_ONLY_TOOL_IDS });
    const taskId = await queueDropzoneTask(t);

    // The read-only Connector polls first and must not receive the task.
    const denied = await claim(t, "connector-readonly");
    expect(denied.status).toBe("idle");

    // The capable Connector claims it; the read-only one can never take it over.
    const granted = await claim(t);
    expect(granted.task?.taskId).toBe(taskId);
    const row = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(row?.claimedByConnectorId).toBe(TEST_CONNECTOR_ID);
  });

  it("bootstrapConnector still refuses to overwrite an existing Connector", async () => {
    const t = p5Test();
    await seedConnector(t, { allowedToolIds: READ_ONLY_TOOL_IDS });
    await expect(seedConnector(t, { allowedToolIds: FULL_TOOL_IDS })).rejects.toThrow(
      /already exists/,
    );
  });
});
