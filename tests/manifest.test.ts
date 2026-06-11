import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

const root = join(import.meta.dirname, "..");
const m = manifest();
const icons = m.icons ?? [];

/** Width/height from the PNG IHDR chunk (big-endian u32 at 16/20). */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("web app manifest invariants", () => {
  it("is installable: standalone display, start_url, name", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/today");
    expect(m.name).toBe("Predictor");
    expect(m.short_name).toBeTruthy();
  });

  it("uses the navy-950 hex for theme and background", () => {
    expect(m.theme_color).toBe("#0d1016");
    expect(m.background_color).toBe("#0d1016");
  });

  it("ships 192 and 512 PNGs for both any and maskable purposes", () => {
    for (const purpose of ["any", "maskable"] as const) {
      for (const size of ["192x192", "512x512"]) {
        const match = icons.find(
          (icon) =>
            icon.purpose === purpose &&
            icon.sizes === size &&
            icon.type === "image/png",
        );
        expect(match, `missing ${purpose} ${size} png`).toBeTruthy();
      }
    }
  });

  it("every manifest icon file exists in public/ with the declared size", () => {
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const file = join(root, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(file), `missing file for ${icon.src}`).toBe(true);
      if (icon.type === "image/png" && icon.sizes && icon.sizes !== "any") {
        const [w, h] = icon.sizes.split("x").map(Number);
        expect(pngSize(file)).toEqual({ width: w, height: h });
      }
    }
  });

  it("ships a 180x180 apple-touch-icon", () => {
    const file = join(root, "public", "apple-touch-icon.png");
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual({ width: 180, height: 180 });
  });

  it("keeps the favicon as a valid .ico", () => {
    const buf = readFileSync(join(root, "app", "favicon.ico"));
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type: icon
    expect(buf.readUInt16LE(4)).toBeGreaterThan(0); // image count
  });
});
