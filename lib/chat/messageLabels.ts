/** Display labels for transcript authors (storage enums unchanged). */
export function transcriptAuthorLabel(author: string): string {
  if (author === "assistant") return "NEXUS";
  if (author === "user") return "USER";
  if (author === "system") return "SYSTEM";
  return author.toUpperCase();
}
