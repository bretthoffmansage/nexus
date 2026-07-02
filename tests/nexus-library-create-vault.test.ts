import { describe, expect, it } from "vitest";
import { LIBRARY_MAX_UPLOAD_BYTES } from "@/convex/lib/libraryDropzoneConfig";
import {
  encodeMarkdownUtf8,
  generateNexusCreatedFilename,
  isCreateDraftEmpty,
  markdownFileFromText,
  utf8ByteLength,
} from "@/lib/nexus/libraryCreateVault";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";

describe("Library Create to Vault helpers", () => {
  it("preserves exact UTF-8 body without wrappers", () => {
    const text = "# Title\n\n- item one\n\n```code```";
    const file = markdownFileFromText(text, "note.md");
    const decoded = new TextDecoder().decode(encodeMarkdownUtf8(text));
    expect(decoded).toBe(text);
    expect(file.name).toBe("note.md");
    expect(file.type).toBe("text/markdown");
  });

  it("preserves Unicode and blank lines", async () => {
    const text = "café\n\n日本語";
    const decoded = new TextDecoder().decode(encodeMarkdownUtf8(text));
    expect(decoded).toBe(text);
  });

  it("uses whitespace trim only for empty detection", () => {
    expect(isCreateDraftEmpty("   ")).toBe(true);
    expect(isCreateDraftEmpty(" x ")).toBe(false);
    expect(utf8ByteLength(" x ")).toBe(3);
  });

  it("generates safe UTC .md filenames", () => {
    const name = generateNexusCreatedFilename(new Date("2026-07-01T14:30:25.000Z"));
    expect(name).toBe("nexus-created-2026-07-01-143025.md");
    expect(name).not.toContain("/");
  });

  it("rejects drafts over the configured byte limit", () => {
    const big = "a".repeat(LIBRARY_MAX_UPLOAD_BYTES + 1);
    expect(() => markdownFileFromText(big, "big.md")).toThrow("CREATE_DRAFT_TOO_LARGE");
  });
});

describe("Library navigation metadata", () => {
  it("Library is available without Connector badge and shows Vault Library label", () => {
    const library = NEXUS_TOOL_REGISTRY.find((t) => t.id === "documents");
    expect(library?.label).toBe("Vault Library");
    expect(library?.availability).toBe("available");
    expect(library?.href).toBe("/documents");
    const email = NEXUS_TOOL_REGISTRY.find((t) => t.id === "email");
    expect(email?.availability).toBe("connector_required");
  });
});
