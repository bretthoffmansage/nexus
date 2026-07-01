import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";

describe("ChatComposer", () => {
  it("is disabled without help text when no helpText prop is passed", () => {
    render(<ChatComposer />);
    const input = screen.getByLabelText(/Message Nexus/i);
    const send = screen.getByRole("button", { name: /Send/i });

    expect(input).toBeDisabled();
    expect(send).toBeDisabled();
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
  });
});
