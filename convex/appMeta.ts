import { query } from "./_generated/server";

/** Harmless connectivity proof for the P2 shell — not product task logic. */
export const get = query({
  args: {},
  handler: async () => {
    return {
      productName: "Nexus",
      environment: "shell",
      version: "0.1.0-p2",
    };
  },
});
