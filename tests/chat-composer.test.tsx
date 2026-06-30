import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";

describe("ChatComposer", () => {
  it("is disabled and explains why submission is unavailable", () => {
    render(<ChatComposer />);
    const input = screen.getByLabelText(/Message Nexus/i);
    const send = screen.getByRole("button", { name: /Send/i });

    expect(input).toBeDisabled();
    expect(send).toBeDisabled();
    expect(
      screen.getByText(/Task submission will be enabled after Nexus backend setup/i),
    ).toBeInTheDocument();
  });
});
