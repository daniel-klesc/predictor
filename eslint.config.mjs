import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { designTokenRestrictions } from "./eslint-rules/design-tokens.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Design-token guard: no raw hex/hsl()/rgb() colors in className —
  // token utilities only (selectors live in eslint-rules/design-tokens.mjs).
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...designTokenRestrictions],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Convex code:
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
