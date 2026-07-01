import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { sha256HexFromBytes } from "./lib/librarySha256";

export const finalizeUpload = action({
  args: {
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    contentType: v.string(),
    documentId: v.optional(v.id("nexusLibraryDocuments")),
    clientSha256: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      nexusError(NEXUS_ERROR_CODES.UNAUTHENTICATED, "Authentication required");
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_INVALID, "Upload not found");
    }
    const bytes = await blob.arrayBuffer();
    const byteLength = bytes.byteLength;
    const sha256 = await sha256HexFromBytes(bytes);

    if (args.clientSha256 && args.clientSha256.toLowerCase() !== sha256) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_INVALID, "Content digest mismatch");
    }

    return await ctx.runMutation(internal.libraryDocuments.finalizeUploadRecord, {
      clerkUserId: identity.subject,
      storageId: args.storageId,
      originalFilename: args.originalFilename,
      contentType: args.contentType,
      byteLength,
      sha256,
      documentId: args.documentId,
    });
  },
});
