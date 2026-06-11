import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

/**
 * Minimal on purpose — only the @convex-dev/auth tables live here.
 * The schema/seed issue owns the real application tables.
 */
export default defineSchema({
  ...authTables,
});
