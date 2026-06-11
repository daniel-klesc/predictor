/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bets from "../bets.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_eloTsv from "../lib/eloTsv.js";
import type * as lib_footballDataApi from "../lib/footballDataApi.js";
import type * as lib_model_blend from "../lib/model/blend.js";
import type * as lib_model_elo from "../lib/model/elo.js";
import type * as lib_model_goals from "../lib/model/goals.js";
import type * as lib_model_index from "../lib/model/index.js";
import type * as lib_model_margin from "../lib/model/margin.js";
import type * as lib_model_markets from "../lib/model/markets.js";
import type * as lib_model_poisson from "../lib/model/poisson.js";
import type * as lib_model_sim from "../lib/model/sim.js";
import type * as lib_model_value from "../lib/model/value.js";
import type * as lib_oddsApi from "../lib/oddsApi.js";
import type * as lib_openfootball from "../lib/openfootball.js";
import type * as lib_quota from "../lib/quota.js";
import type * as lib_resultsGuard from "../lib/resultsGuard.js";
import type * as lib_teamNameMap from "../lib/teamNameMap.js";
import type * as matches from "../matches.js";
import type * as odds from "../odds.js";
import type * as predictions from "../predictions.js";
import type * as sims from "../sims.js";
import type * as sync_audit from "../sync/audit.js";
import type * as sync_elo from "../sync/elo.js";
import type * as sync_footballData from "../sync/footballData.js";
import type * as sync_oddsApi from "../sync/oddsApi.js";
import type * as sync_refresh from "../sync/refresh.js";
import type * as sync_seed from "../sync/seed.js";
import type * as sync_util from "../sync/util.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bets: typeof bets;
  crons: typeof crons;
  http: typeof http;
  "lib/eloTsv": typeof lib_eloTsv;
  "lib/footballDataApi": typeof lib_footballDataApi;
  "lib/model/blend": typeof lib_model_blend;
  "lib/model/elo": typeof lib_model_elo;
  "lib/model/goals": typeof lib_model_goals;
  "lib/model/index": typeof lib_model_index;
  "lib/model/margin": typeof lib_model_margin;
  "lib/model/markets": typeof lib_model_markets;
  "lib/model/poisson": typeof lib_model_poisson;
  "lib/model/sim": typeof lib_model_sim;
  "lib/model/value": typeof lib_model_value;
  "lib/oddsApi": typeof lib_oddsApi;
  "lib/openfootball": typeof lib_openfootball;
  "lib/quota": typeof lib_quota;
  "lib/resultsGuard": typeof lib_resultsGuard;
  "lib/teamNameMap": typeof lib_teamNameMap;
  matches: typeof matches;
  odds: typeof odds;
  predictions: typeof predictions;
  sims: typeof sims;
  "sync/audit": typeof sync_audit;
  "sync/elo": typeof sync_elo;
  "sync/footballData": typeof sync_footballData;
  "sync/oddsApi": typeof sync_oddsApi;
  "sync/refresh": typeof sync_refresh;
  "sync/seed": typeof sync_seed;
  "sync/util": typeof sync_util;
  teams: typeof teams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
