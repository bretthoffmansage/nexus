"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

const SETTINGS_TABS = [
  { id: "services", label: "Services" },
  { id: "ai", label: "AI" },
  { id: "search", label: "Search" },
  { id: "integrations", label: "Integrations" },
  { id: "email", label: "Email" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
] as const;

/** Ported from legacy_local_console/static/index.html settings modal navigation. */
export function SettingsWorkspace() {
  const [tab, setTab] = useState<(typeof SETTINGS_TABS)[number]["id"]>("services");

  return (
    <section className="legacy-port-workspace legacy-port-settings" aria-labelledby="settings-heading">
      <ToolAvailabilityBanner availability="partially_available" />
      <header className="legacy-port-head">
        <h1 id="settings-heading">Settings</h1>
        <p className="legacy-port-subhead">Hosted-safe preferences and integration status</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label="Settings sections">
          {SETTINGS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "appearance" ? (
            <p>Theme controls remain in the Nexus sidebar footer. Advanced Claudia theme tokens are local-only.</p>
          ) : (
            <p>
              {tab.charAt(0).toUpperCase() + tab.slice(1)} settings that require Claudia execution or local
              secrets are disabled in hosted Nexus.
            </p>
          )}
          <button type="button" className="legacy-port-btn" disabled>
            Save changes
          </button>
        </div>
      </div>
    </section>
  );
}
