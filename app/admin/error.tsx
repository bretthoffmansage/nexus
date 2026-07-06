"use client";

import { useEffect } from "react";

/**
 * Error boundary for the `/admin` segment (covers `/admin` and `/admin/access`).
 * If a render — including the server render on a hard refresh — throws, the user
 * sees a recoverable screen with a retry instead of the platform "couldn't load"
 * page. `reset()` re-runs the segment, so a transient failure self-heals.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route failed to render:", error);
  }, [error]);

  return (
    <div className="nexus-sign-in-shell">
      <div className="nexus-sign-in-panel nexus-card" style={{ width: "min(100%, 480px)" }}>
        <h1 className="nexus-card-title" style={{ textAlign: "center" }}>
          Access administration could not load
        </h1>
        <p className="nexus-sign-in-copy">
          Something interrupted loading this page. This is usually temporary — retry, or
          reload the page.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "center",
            marginTop: "1rem",
          }}
        >
          <button type="button" className="nexus-btn nexus-btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a href="/admin/access" className="nexus-btn nexus-btn-ghost">
            Reload page
          </a>
        </div>
      </div>
    </div>
  );
}
