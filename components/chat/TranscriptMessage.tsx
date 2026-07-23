"use client";

import { useEffect, useRef } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { NeutralCopyRoot } from "@/components/nexus/NeutralCopyRoot";
import { transcriptAuthorLabel } from "@/lib/chat/messageLabels";
import { markMessageAnimated, wasMessageAnimated } from "@/lib/chat/typeOnSession";
import { usePrefersReducedMotion, useTypeOnText } from "@/components/chat/useTypeOnText";

export type TranscriptMessageData = {
  id: Id<"nexusMessages"> | string;
  author: string;
  content: string;
};

type TranscriptMessageProps = {
  message: TranscriptMessageData;
  animate: boolean;
  onGrowth?: () => void;
};

export function TranscriptMessage({ message, animate, onGrowth }: TranscriptMessageProps) {
  const reducedMotion = usePrefersReducedMotion();
  const shouldAnimate =
    animate &&
    message.author === "assistant" &&
    !reducedMotion &&
    !wasMessageAnimated(String(message.id));

  const visible = useTypeOnText({
    fullText: message.content,
    enabled: shouldAnimate,
    onComplete: () => markMessageAnimated(String(message.id)),
  });

  const prevLen = useRef(visible.length);
  useEffect(() => {
    if (visible.length !== prevLen.current) {
      prevLen.current = visible.length;
      onGrowth?.();
    }
  }, [visible.length, onGrowth]);

  const label = transcriptAuthorLabel(message.author);
  const itemClass =
    message.author === "user"
      ? "nexus-transcript-item nexus-transcript-user"
      : message.author === "assistant"
        ? "nexus-transcript-item nexus-transcript-assistant"
        : "nexus-transcript-item nexus-transcript-system";

  return (
    <li className={itemClass}>
      <span className="nexus-transcript-author">{label}</span>
      <NeutralCopyRoot
        as="span"
        className="nexus-transcript-body"
        aria-live={shouldAnimate ? "polite" : undefined}
      >
        {visible}
      </NeutralCopyRoot>
    </li>
  );
}
