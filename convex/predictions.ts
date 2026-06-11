/**
 * Predictions recompute — STUBS.
 *
 * Issue #4 (model) replaces the bodies. The signatures are load-bearing:
 * every sync action schedules these after a data change so the event-driven
 * wiring exists today (predictions are never recomputed by a cron).
 */
import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

/** Recompute predictions for specific matches (scheduled after fixture/result changes). */
export const recomputeForMatches = internalMutation({
  args: { matchIds: v.array(v.id("matches")) },
  handler: async () => {
    // TODO(#4): Dixon-Coles/Poisson recompute for the given matches.
    // Intentional no-op stub — keep the signature.
  },
});

/** Full recompute (scheduled after seed and Elo refreshes). */
export const recomputeAll = internalMutation({
  args: {},
  handler: async () => {
    // TODO(#4): full recompute across upcoming matches + tournament simulation.
    // Intentional no-op stub — keep the signature.
  },
});
