"use client";

import { useEffect, useRef, useState } from "react";
import { TYPE_ON_CHARS_PER_SECOND } from "@/lib/chat/typeOnSession";

type UseTypeOnTextOptions = {
  fullText: string;
  enabled: boolean;
  onComplete?: () => void;
};

/**
 * Reveals `fullText` progressively. When disabled, shows the full string immediately.
 */
export function useTypeOnText({ fullText, enabled, onComplete }: UseTypeOnTextOptions): string {
  const [visibleCount, setVisibleCount] = useState(enabled ? 0 : fullText.length);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!enabled) {
      setVisibleCount(fullText.length);
      return;
    }
    setVisibleCount(0);
    completedRef.current = false;
    if (!fullText.length) return;

    let frame = 0;
    let last = performance.now();
    let count = 0;

    const tick = (now: number) => {
      const dt = Math.max(0, now - last) / 1000;
      last = now;
      const step = Math.max(1, Math.floor(TYPE_ON_CHARS_PER_SECOND * dt));
      count = Math.min(fullText.length, count + step);
      setVisibleCount(count);
      if (count < fullText.length) {
        frame = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, fullText]);

  return fullText.slice(0, visibleCount);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
