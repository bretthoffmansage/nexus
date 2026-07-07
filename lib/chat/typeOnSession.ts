/** Message IDs that finished type-on animation this browser session. */
const animatedMessageIds = new Set<string>();

export function markMessageAnimated(messageId: string): void {
  animatedMessageIds.add(messageId);
}

export function wasMessageAnimated(messageId: string): boolean {
  return animatedMessageIds.has(messageId);
}

export function clearTypeOnSession(): void {
  animatedMessageIds.clear();
}

/** ~4 rendered lines per second at typical chat width (2× the original pace). */
export const TYPE_ON_CHARS_PER_SECOND = 200;
