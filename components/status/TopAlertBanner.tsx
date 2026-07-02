"use client";

import type { ReactNode } from "react";

type TopAlertBannerProps = {
  children: ReactNode;
  onDismiss?: () => void;
  dismissAriaLabel?: string;
};

/** Reusable top-of-app notice banner with optional dismiss control. */
export function TopAlertBanner({
  children,
  onDismiss,
  dismissAriaLabel = "Dismiss notice",
}: TopAlertBannerProps) {
  return (
    <div className="nexus-setup-banner" role="status">
      <div className="nexus-setup-banner-text">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          className="nexus-btn nexus-btn-ghost"
          onClick={onDismiss}
          aria-label={dismissAriaLabel}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
