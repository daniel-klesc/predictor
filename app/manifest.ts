import type { MetadataRoute } from "next";

import { en } from "@/lib/strings/en";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en.app.name,
    short_name: en.app.name,
    description: en.app.description,
    start_url: "/today",
    display: "standalone",
    background_color: "#0d1016", // hsl(var(--navy-950))
    theme_color: "#0d1016",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
