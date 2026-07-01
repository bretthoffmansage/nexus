import type { P5ToolId } from "@/convex/lib/p5config";
import { isSupportedToolId, P5_DEFAULT_TOOL_ID } from "@/convex/lib/p5config";

export type PersistedChatSessionState = {
  /** `null` means the user explicitly chose New chat. */
  conversationId: string | null;
  requestedToolId: string;
};

const STORAGE_PREFIX = "nexus.chat.session.v1";

export function chatSessionStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readPersistedChatSession(userId: string): PersistedChatSessionState | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(chatSessionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const conversationId =
      record.conversationId === null
        ? null
        : typeof record.conversationId === "string" && record.conversationId.length > 0
          ? record.conversationId
          : null;
    const requestedToolId =
      typeof record.requestedToolId === "string" ? record.requestedToolId : P5_DEFAULT_TOOL_ID;
    return { conversationId, requestedToolId };
  } catch {
    return null;
  }
}

export function writePersistedChatSession(
  userId: string,
  state: PersistedChatSessionState,
): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(chatSessionStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore quota/private-mode failures.
  }
}

export function clearPersistedChatSession(userId: string): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(chatSessionStorageKey(userId));
  } catch {
    // Ignore.
  }
}

export function parsePersistedToolId(value: unknown): P5ToolId {
  if (typeof value === "string" && isSupportedToolId(value)) {
    return value;
  }
  return P5_DEFAULT_TOOL_ID;
}
