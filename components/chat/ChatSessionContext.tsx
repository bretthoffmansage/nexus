"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

type ChatSession = {
  /** The conversation currently open, or null for a fresh draft. */
  activeConversationId: Id<"nexusConversations"> | null;
  /** Whether the signed-in user may submit (approved active knowledge_reader). */
  canSubmit: boolean;
  /** Convex auth is still resolving the current token. */
  authLoading: boolean;
  /** Safe to issue a P5 private query/mutation right now (P5.1). */
  readyForPrivateQueries: boolean;
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
  const { isLoading, isAuthenticated, readyForPrivateQueries } = useNexusAuthReadiness();

  // P5.1: as soon as Convex reports the session is no longer authenticated
  // (sign-out, or the moment between accounts), drop any selected
  // conversation so a newly signed-in account can never inherit — even
  // momentarily — the previous account's selection.
  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      setActiveConversationId(null);
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  const value = useMemo<ChatSession>(
    () => ({
      activeConversationId,
      canSubmit,
      authLoading: isLoading,
      readyForPrivateQueries,
      selectConversation: (id) => setActiveConversationId(id),
      startNewRequest: () => setActiveConversationId(null),
    }),
    [activeConversationId, canSubmit, isLoading, readyForPrivateQueries],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

/** Returns the chat session, or null when rendered outside the chat shell. */
export function useChatSession(): ChatSession | null {
  return useContext(ChatSessionContext);
}
