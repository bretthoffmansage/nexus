import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { TopAlertBanner } from "@/components/status/TopAlertBanner";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

describe("TopAlertBanner", () => {
  it("renders a caller-supplied message", () => {
    render(
      <TopAlertBanner>
        <strong>Scheduled maintenance.</strong> Nexus may be briefly unavailable tonight.
      </TopAlertBanner>,
    );
    expect(screen.getByText(/Scheduled maintenance/i)).toBeInTheDocument();
    expect(screen.getByText(/briefly unavailable tonight/i)).toBeInTheDocument();
  });

  it("invokes onDismiss when Dismiss is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <TopAlertBanner onDismiss={onDismiss}>
        Connector maintenance window starts at 02:00 UTC.
      </TopAlertBanner>,
    );

    await user.click(screen.getByRole("button", { name: /Dismiss notice/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("AppShell startup banner", () => {
  it("does not render the obsolete Nexus setup-in-progress message", () => {
    render(
      <ThemeProvider>
        <AppShell clerkEnabled={false} convexConnected={false}>
          <p>Workspace</p>
        </AppShell>
      </ThemeProvider>,
    );

    expect(screen.queryByText(/Nexus setup in progress/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Read-only task connectivity through the Console Connector/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Claudia is not connected yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dismiss setup notice/i })).not.toBeInTheDocument();
  });
});
