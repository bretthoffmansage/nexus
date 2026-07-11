"use client";

import { useState } from "react";
import { MEMORY_CATEGORIES, memoryAdapterMeta } from "@/lib/adapters/memory/adapter";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

/** Ported from legacy_local_console/static/js/memory.js modal layout. */
export function MemoryWorkspace() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const disconnected = memoryAdapterMeta.availability !== "available";

  return (
    <section className="legacy-port-workspace legacy-port-memory" aria-labelledby="memory-heading">
      <ToolAvailabilityBanner availability={memoryAdapterMeta.availability} />
      <header className="memory-modal-header legacy-port-head">
        <h1 id="memory-heading">Brain</h1>
        <p className="legacy-port-subhead">Memory categories, filters, and detail views</p>
      </header>

      <div className="memory-toolbar">
        <div className="memory-category-filters" id="memory-category-filters">
          {MEMORY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`memory-cat-chip${activeCategory === cat ? " active" : ""}`}
              onClick={() => setActiveCategory(cat)}
              disabled={disconnected}
            >
              {cat}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort memories"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          disabled={disconnected}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <button type="button" className="legacy-port-btn" disabled>
          Add memory
        </button>
      </div>

      <input
        type="search"
        className="memory-search-input"
        placeholder="Search memories…"
        disabled={disconnected}
        aria-label="Search memories"
      />

      <div className="memory-grid legacy-port-empty">
        <p>
          No memories in hosted Nexus. Brain data is not copied into Convex; memories load from
          the system when connected.
        </p>
      </div>
    </section>
  );
}
