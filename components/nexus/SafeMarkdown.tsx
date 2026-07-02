import type { ReactNode } from "react";
import { SafeExternalLink } from "@/components/nexus/SafeExternalLink";
import { isSafeHttpUrl } from "@/lib/nexus/safeHttpUrl";

type InlineNode = string | ReactNode;

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseInlineMarkdown(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(escapeText(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-b`}>{escapeText(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={`${match.index}-i`}>{escapeText(token.slice(1, -1))}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${match.index}-c`}>{escapeText(token.slice(1, -1))}</code>);
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        if (isSafeHttpUrl(href)) {
          nodes.push(
            <SafeExternalLink key={`${match.index}-a`} href={href} className="nexus-safe-link">
              {escapeText(label)}
            </SafeExternalLink>,
          );
        } else {
          nodes.push(escapeText(label));
        }
      } else {
        nodes.push(escapeText(token));
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(escapeText(text.slice(lastIndex)));
  }
  return nodes.length > 0 ? nodes : [escapeText(text)];
}

type SafeMarkdownProps = {
  text: string;
  className?: string;
};

/**
 * Bounded Markdown renderer for governed Nexus reports. Escapes raw HTML,
 * supports a small safe subset, and only links http/https URLs.
 */
export function SafeMarkdown({ text, className }: SafeMarkdownProps) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={index} className="nexus-markdown-h3">
              {parseInlineMarkdown(trimmed.slice(2))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={index} className="nexus-markdown-h4">
              {parseInlineMarkdown(trimmed.slice(3))}
            </h4>
          );
        }
        const lines = trimmed.split("\n");
        return (
          <p key={index} className="nexus-markdown-p">
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {parseInlineMarkdown(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
