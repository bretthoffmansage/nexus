"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";

type ChatSession = {
  /** The conversation currently open, or null for a fresh draft. */
  activeConversationId: Id<"nexusConversations"> | null;
  /** Whether the signed-in user may submit (approved active knowledge_reader). */
  canSubmit: boolean;
  selectConversation: (id: Id<"nexusConversations"> | null) => void;
  startNewRequest: () => void;
};

const ChatSessionContext = createContext<ChatSession | null>(null);

export function ChatSessionProvider({
  canSubmit,
  children,
}: {
  canSubmit: boolean;
  children: ReactNode;
}) {
  const [activeConversationId, setActiveConversationId] =
    useState<Id<"nexusConversations"> | null>(null);

  const value = useMemo<ChatSession>(
    () => ({
      activeConversationId,
      canSubmit,
      selectConversation: (id) => setActiveConversationId(id),
      startNewRequest: () => setActiveConversationId(null),
    }),
    [activeConversationId, canSubmit],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

/** Returns the chat session, or null when rendered outside the chat shell. */
export function useChatSession(): ChatSession | null {
  return useContext(ChatSessionContext);
}
