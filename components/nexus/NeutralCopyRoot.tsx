"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { NEXUS_NEUTRAL_COPY_ATTR } from "@/lib/nexus/neutralClipboardCopy";
import { useNeutralClipboardCopy } from "@/lib/nexus/useNeutralClipboardCopy";

type NeutralCopyRootProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "span";
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">;

/**
 * Marks a subtree for neutral clipboard copy (black text on white background)
 * without altering on-screen theme colors.
 */
export function NeutralCopyRoot({
  children,
  className,
  as = "div",
  ...rest
}: NeutralCopyRootProps) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useNeutralClipboardCopy(node);

  const markerProps = { [NEXUS_NEUTRAL_COPY_ATTR]: "" };

  if (as === "span") {
    return (
      <span ref={setNode} className={className} {...markerProps} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <div ref={setNode} className={className} {...markerProps} {...rest}>
      {children}
    </div>
  );
}
