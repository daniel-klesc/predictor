/**
 * Pure helpers that turn assistant tool traces into renderable view data
 * (chat UI issue #8):
 *
 * - `toolChipDetail` / `toolChipDetailFromArgs` — the compact arg summary
 *   shown on a tool chip ("#1", "MEX", `"Mexico lineup news"`).
 * - `parseAssistantBlocks` — folds the persisted `chatMessages.blocks` trace
 *   (shape: {@link StoredAssistantBlock}[] stored as `any`) into chips,
 *   proposed-bet cards, and inline error markers for re-render on reload.
 * - `parseProposedBet` — lenient parse of a propose_bet tool result. The SSE
 *   `tool-result.summary` is truncated to ~200 chars, which can cut the JSON
 *   mid-string, so a field-level regex fallback covers truncated payloads.
 */
import { formatDecimalOdds, formatPercent } from "@/lib/format";
import { en } from "@/lib/strings/en";

const DETAIL_MAX_LENGTH = 40;

function clip(text: string): string {
  return text.length > DETAIL_MAX_LENGTH
    ? `${text.slice(0, DETAIL_MAX_LENGTH - 1)}…`
    : text;
}

/** Compact human summary of a tool's input for its chip ("" when nothing salient). */
export function toolChipDetail(name: string, input: unknown): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return "";
  }
  const args = input as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof args.matchNumber === "number") parts.push(`#${args.matchNumber}`);
  const code = args.teamCode ?? args.code;
  if (typeof code === "string" && code !== "") parts.push(code.toUpperCase());
  if (typeof args.date === "string" && args.date !== "") parts.push(args.date);
  if (typeof args.stage === "string" && args.stage !== "") {
    parts.push(args.stage);
  }
  if (typeof args.minEdge === "number") {
    parts.push(`≥${formatPercent(args.minEdge)}`);
  }
  if (typeof args.query === "string" && args.query !== "") {
    parts.push(`"${clip(args.query)}"`);
  }
  if (typeof args.market === "string" && typeof args.selection === "string") {
    parts.push(`${args.market} ${args.selection}`);
  }
  if (typeof args.odds === "number") parts.push(`@ ${args.odds}`);
  return parts.join(" ");
}

/** Same, from the JSON `args` string of a `tool-start` SSE event. */
export function toolChipDetailFromArgs(name: string, argsJson: string): string {
  if (argsJson === "") return "";
  try {
    return toolChipDetail(name, JSON.parse(argsJson));
  } catch {
    // The 200-char event summary can truncate the JSON — show no detail.
    return "";
  }
}

/** One finished tool call from a persisted assistant message. */
export interface PersistedToolChip {
  key: string;
  name: string;
  detail: string;
  isError: boolean;
}

/** Fields of a propose_bet result the card renders (null = not present). */
export interface ProposedBetView {
  /** "MEX–RSA (#1)" */
  match: string | null;
  market: string | null;
  selection: string | null;
  odds: number | null;
  bookmaker: string | null;
}

export interface AssistantTrace {
  chips: PersistedToolChip[];
  proposedBets: ProposedBetView[];
  /** Persisted error markers (stream interruptions, tool budget stops). */
  errorMarkers: string[];
}

/**
 * Lenient parse of a propose_bet tool result payload. Accepts the full JSON
 * (persisted blocks) and the truncated SSE summary; returns null unless the
 * payload affirms `"proposed":true`.
 */
export function parseProposedBet(content: string): ProposedBetView | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { proposed?: unknown }).proposed === true
    ) {
      const record = parsed as Record<string, unknown>;
      return {
        match: typeof record.match === "string" ? record.match : null,
        market: typeof record.market === "string" ? record.market : null,
        selection:
          typeof record.selection === "string" ? record.selection : null,
        odds: typeof record.odds === "number" ? record.odds : null,
        bookmaker:
          typeof record.bookmaker === "string" ? record.bookmaker : null,
      };
    }
    return null;
  } catch {
    // Truncated JSON (SSE summary cap) — extract the early fields by regex.
    if (!/"proposed"\s*:\s*true/.test(content)) return null;
    const str = (key: string): string | null =>
      new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(content)?.[1] ?? null;
    const num = (key: string): number | null => {
      const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(
        content,
      );
      return match ? Number(match[1]) : null;
    };
    return {
      match: str("match"),
      market: str("market"),
      selection: str("selection"),
      odds: num("odds"),
      bookmaker: str("bookmaker"),
    };
  }
}

/**
 * "MEX win @ 1.95" — human title for a proposed-bet card. Falls back to the
 * raw "market selection" pair for unmapped markets (never invents copy).
 */
export function proposedBetTitle(bet: ProposedBetView): string {
  const codes = /^([A-Z]{2,3})–([A-Z]{2,3})/.exec(bet.match ?? "");
  const market = (bet.market ?? "").toLowerCase();
  const selection = (bet.selection ?? "").toLowerCase();
  let label: string | null = null;
  if (market === "h2h") {
    if (selection === "home" && codes) label = en.match.win(codes[1]);
    else if (selection === "away" && codes) label = en.match.win(codes[2]);
    else if (selection === "draw") label = en.match.draw;
  } else if (market.startsWith("totals")) {
    if (selection === "over") label = en.match.over25Short;
    else if (selection === "under") label = en.match.under25Short;
  } else if (market === "btts" && selection === "yes") {
    label = en.match.bttsYes;
  }
  if (label === null) {
    label = [bet.market, bet.selection].filter(Boolean).join(" ") || "—";
  }
  const odds = bet.odds !== null ? formatDecimalOdds(bet.odds) : "—";
  return `${label} @ ${odds}`;
}

/**
 * Fold persisted assistant `blocks` (untrusted `any` from Convex) into the
 * tool trace the bubble renders. Unknown block shapes are skipped.
 */
export function parseAssistantBlocks(blocks: unknown): AssistantTrace {
  const chips: PersistedToolChip[] = [];
  const proposedBets: ProposedBetView[] = [];
  const errorMarkers: string[] = [];
  if (!Array.isArray(blocks)) return { chips, proposedBets, errorMarkers };

  const chipByToolUseId = new Map<string, PersistedToolChip>();
  for (const raw of blocks) {
    if (raw === null || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    switch (block.type) {
      case "tool_use":
      case "server_tool_use": {
        const name = typeof block.name === "string" ? block.name : "tool";
        const chip: PersistedToolChip = {
          key: `chip-${chips.length}`,
          name,
          detail: toolChipDetail(name, block.input),
          isError: false,
        };
        chips.push(chip);
        if (typeof block.id === "string") chipByToolUseId.set(block.id, chip);
        break;
      }
      case "tool_result": {
        const chip =
          typeof block.toolUseId === "string"
            ? chipByToolUseId.get(block.toolUseId)
            : undefined;
        if (block.isError === true) {
          if (chip) chip.isError = true;
          break;
        }
        if (block.name === "propose_bet" && typeof block.content === "string") {
          const bet = parseProposedBet(block.content);
          if (bet) proposedBets.push(bet);
        }
        break;
      }
      case "error": {
        if (typeof block.message === "string" && block.message !== "") {
          errorMarkers.push(block.message);
        }
        break;
      }
      default:
        // text / thinking / web_search_tool_result need no extra rendering.
        break;
    }
  }
  return { chips, proposedBets, errorMarkers };
}
