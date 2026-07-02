import type { ReactNode } from "react";
import { isSafeHttpUrl } from "@/lib/nexus/safeHttpUrl";

type SafeExternalLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

/** External link with http/https scheme guard and safe tab behavior. */
export function SafeExternalLink({ href, children, className }: SafeExternalLinkProps) {
  if (!isSafeHttpUrl(href)) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
