import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  chatSessionStorageKey,
  clearPersistedChatSession,
  parsePersistedToolId,
  readPersistedChatSession,
  writePersistedChatSession,
} from "@/lib/chat/chatSessionPersistence";

describe("chatSessionPersistence", () => {
  const userA = "user_A";
  const userB = "user_B";

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("namespaces storage by Clerk user ID", () => {
    writePersistedChatSession(userA, {
      conversationId: "convo_a",
      requestedToolId: "membership_io.transcript_retrieve",
    });
    writePersistedChatSession(userB, {
      conversationId: "convo_b",
      requestedToolId: "vault.agentic_retrieval",
    });

    expect(readPersistedChatSession(userA)?.conversationId).toBe("convo_a");
    expect(readPersistedChatSession(userB)?.conversationId).toBe("convo_b");
    expect(chatSessionStorageKey(userA)).not.toBe(chatSessionStorageKey(userB));
  });

  it("persists explicit New chat as null conversation ID", () => {
    writePersistedChatSession(userA, {
      conversationId: null,
      requestedToolId: "vault.agentic_retrieval",
    });
    expect(readPersistedChatSession(userA)?.conversationId).toBeNull();
  });

  it("falls back to the default tool for malformed stored values", () => {
    sessionStorage.setItem(
      chatSessionStorageKey(userA),
      JSON.stringify({ conversationId: null, requestedToolId: "shell.exec" }),
    );
    expect(parsePersistedToolId(readPersistedChatSession(userA)?.requestedToolId)).toBe(
      "vault.agentic_retrieval",
    );
  });

  it("clears persisted state for a user", () => {
    writePersistedChatSession(userA, {
      conversationId: "convo_a",
      requestedToolId: "vault.agentic_retrieval",
    });
    clearPersistedChatSession(userA);
    expect(readPersistedChatSession(userA)).toBeNull();
  });
});
