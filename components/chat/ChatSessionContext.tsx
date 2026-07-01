"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { P5ToolId } from "@/convex/lib/p5config";
import { P5_DEFAULT_TOOL_ID } from "@/convex/lib/p5config";
import {
  parsePersistedToolId,
  readPersistedChatSession,
  writePersistedChatSession,
} from "@/lib/chat/chatSessionPersistence";
import { nexusChat } from "@/lib/nexus/p5Client";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

type ChatSession = {
  activeConversationId: Id<"nexusConversations"> | null;
  selectedToolId: P5ToolId;
  canSubmit: boolean;
  authLoading: boolean;
  readyForPrivateQueries: boolean;
  /** False until saved session state has been applied for the current user. */
  chatSessionReady: boolean;
  selectConversation: (id: Id<"nexusConversations"> | null) => void;
  startNewRequest: () => void;
  setSelectedToolId: (toolId: P5ToolId) => void;
};

const ChatSessionContext = createContext<ChatSession | null>(null);

function useClerkUserId(): string | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- always invoked; degrade when Clerk is not mounted.
    const { userId } = useAuth();
    return userId ?? null;
  } catch {
    return null;
  }
}

type RestorePhase =
  | "pending"
  | "none"
  | { conversationId: Id<"nexusConversations"> };

export function ChatSessionProvider({
  canSubmit,
  children,
}: {
  canSubmit: boolean;
  children: ReactNode;
}) {
  const userId = useClerkUserId();
  const { isLoading, isAuthenticated, readyForPrivateQueries } = useNexusAuthReadiness();

  const [activeConversationId, setActiveConversationId] =
    useState<Id<"nexusConversations"> | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<P5ToolId>(P5_DEFAULT_TOOL_ID);
  const [restorePhase, setRestorePhase] = useState<RestorePhase>("pending");
  const [chatSessionReady, setChatSessionReady] = useState(false);

  const selectedToolIdRef = useRef(selectedToolId);
  selectedToolIdRef.current = selectedToolId;
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  const persistSession = useCallback(
    (conversationId: Id<"nexusConversations"> | null, toolId: P5ToolId) => {
      if (!userId) return;
      writePersistedChatSession(userId, {
        conversationId,
        requestedToolId: toolId,
      });
    },
    [userId],
  );

  useLayoutEffect(() => {
    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = userId ?? null;

    if (previousUserId !== undefined && previousUserId !== (userId ?? null)) {
      setActiveConversationId(null);
      setSelectedToolId(P5_DEFAULT_TOOL_ID);
      setRestorePhase("pending");
      setChatSessionReady(false);
    }

    if (!userId) {
      if (isLoading) return;
      setRestorePhase("none");
      setChatSessionReady(true);
      return;
    }

    const saved = readPersistedChatSession(userId);
    if (!saved) {
      setRestorePhase("none");
      setChatSessionReady(true);
      return;
    }

    setSelectedToolId(parsePersistedToolId(saved.requestedToolId));
    if (saved.conversationId === null) {
      setActiveConversationId(null);
      setRestorePhase("none");
      setChatSessionReady(true);
      return;
    }

    setRestorePhase({ conversationId: saved.conversationId as Id<"nexusConversations"> });
    setChatSessionReady(false);
  }, [userId, isLoading, isAuthenticated]);

  const restoreConversationId =
    typeof restorePhase === "object" ? restorePhase.conversationId : null;

  const conversationsForRestore = useQuery(
    nexusChat.listMyConversations,
    restoreConversationId && readyForPrivateQueries ? { limit: 100 } : "skip",
  );

  useEffect(() => {
    if (restorePhase === "pending" || restorePhase === "none") return;
    if (!readyForPrivateQueries) return;
    if (conversationsForRestore === undefined) return;

    const target = restorePhase.conversationId;
    const found = conversationsForRestore.conversations.find(
      (conversation) => conversation.id === target && conversation.status === "active",
    );
    if (found) {
      setActiveConversationId(target);
    } else if (userId) {
      writePersistedChatSession(userId, {
        conversationId: null,
        requestedToolId: selectedToolIdRef.current,
      });
      setActiveConversationId(null);
    }

    setRestorePhase("none");
    setChatSessionReady(true);
  }, [restorePhase, conversationsForRestore, readyForPrivateQueries, userId]);

  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      setActiveConversationId(null);
      setRestorePhase("none");
      setChatSessionReady(true);
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  const selectConversation = useCallback(
    (id: Id<"nexusConversations"> | null) => {
      setActiveConversationId(id);
      persistSession(id, selectedToolIdRef.current);
    },
    [persistSession],
  );

  const startNewRequest = useCallback(() => {
    setActiveConversationId(null);
    persistSession(null, selectedToolIdRef.current);
  }, [persistSession]);

  const setSelectedToolIdAndPersist = useCallback(
    (toolId: P5ToolId) => {
      setSelectedToolId(toolId);
      persistSession(activeConversationIdRef.current, toolId);
    },
    [persistSession],
  );

  const value = useMemo<ChatSession>(
    () => ({
      activeConversationId,
      selectedToolId,
      canSubmit,
      authLoading: isLoading,
      readyForPrivateQueries,
      chatSessionReady,
      selectConversation,
      startNewRequest,
      setSelectedToolId: setSelectedToolIdAndPersist,
    }),
    [
      activeConversationId,
      selectedToolId,
      canSubmit,
      isLoading,
      readyForPrivateQueries,
      chatSessionReady,
      selectConversation,
      startNewRequest,
      setSelectedToolIdAndPersist,
    ],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession(): ChatSession | null {
  return useContext(ChatSessionContext);
}
