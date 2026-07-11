"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { galleryAdapterMeta } from "@/lib/adapters/gallery/adapter";

const TABS = ["Photos", "Albums", "Tags"] as const;

/** Ported from legacy_local_console/static/js/gallery.js browsing shell (editor deferred). */
export function GalleryWorkspace() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Photos");
  const [search, setSearch] = useState("");
  const disconnected = galleryAdapterMeta.availability !== "available";

  return (
    <section className="legacy-port-workspace legacy-port-gallery" aria-labelledby="gallery-heading">
      <ToolAvailabilityBanner availability={galleryAdapterMeta.availability} />
      <header className="legacy-port-head legacy-port-head--split">
        <div>
          <h1 id="gallery-heading">Gallery</h1>
          <p className="legacy-port-subhead">Photo backup and generated image library</p>
        </div>
        <span className="gallery-tag-count">Image editor deferred</span>
      </header>

      <div className="gallery-toolbar">
        <div className="gallery-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`gallery-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="gallery-search"
          placeholder="Search tags or models…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disconnected}
        />
        <select disabled aria-label="Sort gallery">
          <option>Shuffle</option>
          <option>Newest</option>
          <option>Oldest</option>
        </select>
      </div>

      <div id="gallery-grid" className="gallery-grid legacy-port-empty">
        <p>No photos loaded. Gallery media remains on system local storage.</p>
      </div>
    </section>
  );
}
