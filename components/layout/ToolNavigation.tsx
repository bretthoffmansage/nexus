"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toolsForNavigation } from "@/lib/navigation/toolRegistry";
import type { NexusToolGroup } from "@/lib/navigation/toolRegistry";

const GROUP_LABELS: Record<NexusToolGroup, string> = {
  chat: "Chat",
  communication: "Communication",
  tools: "Tools",
  system: "System",
  admin: "Admin",
};

type ToolNavigationProps = {
  isAdmin?: boolean;
  canAccessDeepResearch?: boolean;
};

export function ToolNavigation({ isAdmin, canAccessDeepResearch }: ToolNavigationProps) {
  const pathname = usePathname() ?? "/";
  const tools = toolsForNavigation({ isAdmin, canAccessDeepResearch });

  const groups = (["chat", "communication", "tools", "system", "admin"] as NexusToolGroup[]).filter(
    (group) => tools.some((tool) => tool.group === group),
  );

  return (
    <>
      {groups.map((group) => (
        <div key={group} className="nexus-nav-group">
          {group !== "chat" ? (
            <div className="nexus-nav-group-label">{GROUP_LABELS[group]}</div>
          ) : null}
          {tools
            .filter((tool) => tool.group === group)
            .map((tool) => {
              const active =
                tool.href === "/"
                  ? pathname === "/"
                  : pathname === tool.href || pathname.startsWith(`${tool.href}/`);
              return (
                <Link
                  key={tool.id}
                  href={tool.href}
                  className={`nexus-nav-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  data-tool-id={tool.id}
                  data-legacy-button={tool.legacyButtonId}
                >
                  <span>{tool.label}</span>
                  {tool.availability !== "available" && tool.availability !== "partially_available" ? (
                    <span className={`nexus-nav-badge nexus-nav-badge--${tool.availability}`}>
                      {tool.availability === "connector_required" ? "Connector" : "—"}
                    </span>
                  ) : null}
                </Link>
              );
            })}
        </div>
      ))}
    </>
  );
}
