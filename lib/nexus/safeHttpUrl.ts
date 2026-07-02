/** Returns true when `value` is a safe http or https URL for user-facing links. */
export function isSafeHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
