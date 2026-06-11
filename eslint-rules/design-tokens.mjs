/**
 * Design-token lint guard: raw colors are banned inside `className`
 * values in app/** and components/** — style ONLY with token-driven
 * Tailwind utilities (see CLAUDE.md, "Design-token rules").
 *
 * Implemented as `no-restricted-syntax` selectors (no custom plugin to
 * maintain). Coverage: string literals AND template literals anywhere
 * inside a className JSX attribute — including `cn(...)` arguments and
 * conditional expressions. CSS files are out of scope (ESLint never sees
 * them), and CSS-var-driven inline styles like
 * `style={{ color: "hsl(var(--primary))" }}` stay allowed because the
 * selectors only match inside className attributes.
 *
 * Shared between `eslint.config.mjs` and `tests/tokenLintRule.test.ts`
 * (the test runs both patterns against fixtures so a selector typo fails
 * CI instead of silently disabling the rule).
 */

const HEX_COLOR = "#[0-9a-fA-F]{3,8}\\b";
const COLOR_FUNCTION = "\\b(?:hsla?|rgba?)\\(";

const HEX_MESSAGE =
  "Raw hex color in className — use a design-token utility (CLAUDE.md, Design-token rules).";
const FUNCTION_MESSAGE =
  "Raw hsl()/rgb() in className — use a design-token utility (CLAUDE.md, Design-token rules).";

/** Selector targeting string/template literals inside className. */
const inClassName = (literalSelector) =>
  `JSXAttribute[name.name='className'] ${literalSelector}`;

/** Entries for the `no-restricted-syntax` rule. */
export const designTokenRestrictions = [
  {
    selector: inClassName(`Literal[value=/${HEX_COLOR}/]`),
    message: HEX_MESSAGE,
  },
  {
    selector: inClassName(`TemplateElement[value.raw=/${HEX_COLOR}/]`),
    message: HEX_MESSAGE,
  },
  {
    selector: inClassName(`Literal[value=/${COLOR_FUNCTION}/]`),
    message: FUNCTION_MESSAGE,
  },
  {
    selector: inClassName(`TemplateElement[value.raw=/${COLOR_FUNCTION}/]`),
    message: FUNCTION_MESSAGE,
  },
];
