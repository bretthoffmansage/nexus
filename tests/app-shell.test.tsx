import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

describe("AppShell sidebar", () => {
  it("toggles navigation from the header control", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AppShell clerkEnabled={false} convexConnected={false}>
          <p>Workspace</p>
        </AppShell>
      </ThemeProvider>,
    );

    const toggle = screen.getByRole("button", { name: /Toggle navigation/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: /Primary/i })).toBeInTheDocument();
  });
});
