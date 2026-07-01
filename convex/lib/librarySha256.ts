/** Lowercase hex SHA-256 digest of exact bytes (authoritative wire format). */
export async function sha256HexFromBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function normalizeSha256Hex(value: string): string {
  return value.trim().toLowerCase();
}
