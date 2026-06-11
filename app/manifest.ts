import type { MetadataRoute } from "next";

import { en } from "@/lib/strings/en";

/**
 * Web app manifest. Colors are the hex equivalent of the navy-950 token
 * (`220 25% 7%` → #0d1016). PNGs are generated from the SVG sources by
 * `scripts/generate-icons.mjs` (run `npm run icons` after editing them).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: en.app.name,
    short_name: en.app.name,
    description: en.app.description,
    start_url: "/today",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1016", // hsl(var(--navy-950))
    theme_color: "#0d1016",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
