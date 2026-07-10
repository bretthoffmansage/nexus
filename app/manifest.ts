import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus",
    short_name: "Nexus",
    description:
      "Nexus — hosted knowledge workspace. The private system executes governed work through the Console Connector.",
    start_url: "/",
    display: "standalone",
    background_color: "#282c34",
    theme_color: "#282c34",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
