import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("defaults collapsed and expands on interaction", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsPanel />);

    expect(screen.queryByText(/Technical details will appear/i)).not.toBeVisible();
    await user.click(screen.getByText("Diagnostics"));
    expect(
      screen.getByText(/Technical details will appear here for completed requests/i),
    ).toBeVisible();
  });
});
