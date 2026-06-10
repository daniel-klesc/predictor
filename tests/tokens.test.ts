import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const css = readFileSync(join(root, "app", "globals.css"), "utf8");

describe("design token contract (app/globals.css)", () => {
  it("defines the specced raw scale anchors as raw HSL triplets", () => {
    expect(css).toContain("--navy-950: 220 25% 7%");
    expect(css).toContain("--navy-50: 45 10% 93%");
    expect(css).toContain("--volt-500: 80 95% 55%");
    expect(css).toContain("--teal-500: 174 60% 40%");
    expect(css).toContain("--error-500: 4 80% 60%");
    expect(css).toContain("--success-500: 142 60% 45%");
  });

  it("defines the semantic layer", () => {
    for (const token of [
      "--background",
      "--card",
      "--primary",
      "--value-strong",
      "--value-mild",
      "--edge-positive",
      "--edge-negative",
    ]) {
      expect(css, `missing semantic token ${token}`).toMatch(
        new RegExp(`${token}:\\s`),
      );
    }
  });

  it("maps tokens to Tailwind via @theme inline", () => {
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-primary: hsl(var(--primary))");
    expect(css).toContain("--color-value-strong: hsl(var(--value-strong))");
  });

  it("defines the specced radii", () => {
    expect(css).toContain("--radius-card: 12px");
    expect(css).toContain("--radius-tile: 10px");
  });

  it("has no tailwind.config — Tailwind 4 is CSS-first", () => {
    expect(existsSync(join(root, "tailwind.config.ts"))).toBe(false);
    expect(existsSync(join(root, "tailwind.config.js"))).toBe(false);
  });
});
