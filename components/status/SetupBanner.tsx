"use client";

type SetupBannerProps = {
  onDismiss?: () => void;
};

export function SetupBanner({ onDismiss }: SetupBannerProps) {
  return (
    <div className="nexus-setup-banner" role="status">
      <div className="nexus-setup-banner-text">
        <strong>Nexus setup in progress.</strong> Read-only task connectivity through the
        Claudia Connector will be enabled in a later setup step. Claudia is not connected yet.
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="nexus-btn nexus-btn-ghost"
          onClick={onDismiss}
          aria-label="Dismiss setup notice"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
