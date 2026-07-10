import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaudiaPresence } from "@/components/status/ClaudiaPresence";

describe("ClaudiaPresence", () => {
  it("shows truthful not-configured placeholder by default", () => {
    render(<ClaudiaPresence />);
    expect(screen.getByText(/Connector not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/System connection not yet linked/i)).toBeInTheDocument();
    expect(screen.queryByText(/System online/i)).not.toBeInTheDocument();
  });
});
