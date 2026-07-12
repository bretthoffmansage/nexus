import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";
import {
  getRequestToolDisplayLabel,
  NEXUS_REQUEST_TOOL_DISPLAY,
} from "@/lib/nexus/toolDisplayLabels";
import {
  P5_DEFAULT_TOOL_ID,
  P5_SUPPORTED_TOOL_IDS,
} from "@/convex/lib/p5config";

describe("Nexus request tool display labels", () => {
  it("1. renders Vault in the chat composer", () => {
    render(<ChatComposer disabled={false} onSubmit={() => undefined} />);
    expect(screen.getByRole("button", { name: "Vault" })).toBeInTheDocument();
  });

  it("2. renders Transcripts in the chat composer", () => {
    render(<ChatComposer disabled={false} onSubmit={() => undefined} />);
    expect(screen.getByRole("button", { name: "Transcripts" })).toBeInTheDocument();
  });

  it("3. submits vault.agentic_retrieval when Vault is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChatComposer disabled={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Vault" }));
    await user.type(screen.getByLabelText(/Message Nexus/i), "vault question");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    expect(onSubmit).toHaveBeenCalledWith("vault question", "vault.agentic_retrieval");
  });

  it("4. submits knowledge.asset_query when Transcripts is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChatComposer disabled={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Transcripts" }));
    await user.type(screen.getByLabelText(/Message Nexus/i), "transcript question");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      "transcript question",
      "knowledge.asset_query",
    );
  });

  it("5. does not change the P5 allowlist or canonical tool IDs", () => {
    expect(P5_SUPPORTED_TOOL_IDS).toEqual([
      "vault.agentic_retrieval",
      "knowledge.asset_query",
    ]);
    expect(P5_DEFAULT_TOOL_ID).toBe("vault.agentic_retrieval");
    expect(NEXUS_REQUEST_TOOL_DISPLAY["vault.agentic_retrieval"].id).toBe(
      "vault.agentic_retrieval",
    );
    expect(NEXUS_REQUEST_TOOL_DISPLAY["knowledge.asset_query"].id).toBe(
      "knowledge.asset_query",
    );
    expect(getRequestToolDisplayLabel("vault.agentic_retrieval")).toBe("Vault");
  });

  it("6. does not show internal tool IDs in the normal chat composer UI", () => {
    render(<ChatComposer disabled={false} onSubmit={() => undefined} />);
    expect(screen.queryByText("vault.agentic_retrieval")).not.toBeInTheDocument();
    expect(screen.queryByText("knowledge.asset_query")).not.toBeInTheDocument();
  });
});
