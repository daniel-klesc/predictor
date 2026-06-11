/**
 * Design-token lint guard — fixture run. Verifies the
 * `no-restricted-syntax` selectors shared with `eslint.config.mjs`
 * (eslint-rules/design-tokens.mjs) flag raw colors in className and stay
 * quiet on token-driven code, so a selector typo fails CI instead of
 * silently disabling the rule.
 */
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { designTokenRestrictions } from "../eslint-rules/design-tokens.mjs";

const linter = new Linter();

function lint(code: string): string[] {
  const messages = linter.verify(code, {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-restricted-syntax": ["error", ...designTokenRestrictions],
    },
  });
  return messages.map((message) => message.message);
}

describe("design-token lint rule (className color guard)", () => {
  it("fails on a raw hex color in a className string literal", () => {
    const errors = lint(
      `export const X = () => <div className="bg-[#abc123] p-2" />;`,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Raw hex color/);
  });

  it("fails on short hex colors too", () => {
    expect(
      lint(`export const X = () => <div className="text-[#fff]" />;`),
    ).toHaveLength(1);
  });

  it("fails on hsl()/rgb() literals in className", () => {
    expect(
      lint(`export const X = () => <div className="bg-[hsl(80,95%,55%)]" />;`),
    ).toHaveLength(1);
    expect(
      lint(`export const X = () => <div className="bg-[rgba(0,0,0,0.5)]" />;`),
    ).toHaveLength(1);
  });

  it("fails inside template literals and cn() arguments", () => {
    expect(
      lint(
        "export const X = (on) => <div className={`p-2 ${on ? 'x' : 'y'} bg-[#0f0]`} />;",
      ),
    ).toHaveLength(1);
    expect(
      lint(
        `export const X = () => <div className={cn("p-2", "text-[#ff0000]")} />;`,
      ),
    ).toHaveLength(1);
  });

  it("passes token-driven utilities", () => {
    expect(
      lint(
        `export const X = () => <div className="rounded-card border-border bg-card text-primary hover:bg-primary/20" />;`,
      ),
    ).toEqual([]);
  });

  it("passes arbitrary values that are not colors", () => {
    expect(
      lint(
        `export const X = () => <div className="h-[960px] text-[15px] grid-cols-[minmax(0,1fr)_3rem]" />;`,
      ),
    ).toEqual([]);
  });

  it("allows CSS-var-driven inline styles (style prop is out of scope)", () => {
    expect(
      lint(
        `export const X = () => <div style={{ color: "hsl(var(--primary))" }} className="p-2" />;`,
      ),
    ).toEqual([]);
  });
});
