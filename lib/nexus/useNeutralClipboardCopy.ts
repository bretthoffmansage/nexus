"use client";

import { useEffect } from "react";
import { handleNeutralCopyEvent } from "@/lib/nexus/neutralClipboardCopy";

/**
 * Bind a copy interceptor on a marked answer-readback container so highlight
 * + Ctrl/Cmd-C pastes black text on a white background without changing
 * on-screen theme colors.
 */
export function useNeutralClipboardCopy(node: HTMLElement | null): void {
  useEffect(() => {
    if (!node) return;

    const onCopy = (event: ClipboardEvent) => {
      handleNeutralCopyEvent(event, node);
    };

    node.addEventListener("copy", onCopy);
    return () => node.removeEventListener("copy", onCopy);
  }, [node]);
}
