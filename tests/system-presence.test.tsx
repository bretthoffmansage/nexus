import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SystemPresence } from "@/components/status/SystemPresence";

describe("SystemPresence", () => {
  it("shows truthful not-configured placeholder by default", () => {
    render(<SystemPresence />);
    expect(screen.getByText(/Connector not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/System connection not yet linked/i)).toBeInTheDocument();
    expect(screen.queryByText(/System online/i)).not.toBeInTheDocument();
  });
});
