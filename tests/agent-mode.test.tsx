import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModeToggle } from "@/components/chat/ModeToggle";

describe("Agent mode", () => {
  it("does not expose an operational Agent control when placeholder is hidden", () => {
    render(<ModeToggle />);
    expect(screen.getByRole("button", { name: /Chat/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Agent/i })).not.toBeInTheDocument();
  });
});
