import type { MatchContext } from "@/lib/chat/system-prompt";
import { DISPLAY_TIME_ZONE } from "@/lib/day";
import { flagEmoji, formatKickoff, formatPlaceholder } from "@/lib/format";

/**
 * Slim match-context strip at the top of a match thread (mockup step 3's
 * "MEX – RSA context"): team pair + kickoff in the display timezone.
 */
export function MatchContextStrip({ match }: { match: MatchContext }) {
  const home = match.home?.code ?? formatPlaceholder(match.homePlaceholder);
  const away = match.away?.code ?? formatPlaceholder(match.awayPlaceholder);
  return (
    <div className="border-border bg-card rounded-tile text-muted-foreground flex items-center justify-between gap-2 border px-3 py-2 text-xs">
      <span className="font-display flex min-w-0 items-center gap-1.5 font-semibold tracking-wider uppercase">
        <span aria-hidden>{flagEmoji(match.home?.code)}</span>
        <span className="truncate">{home}</span>
        <span aria-hidden>–</span>
        <span aria-hidden>{flagEmoji(match.away?.code)}</span>
        <span className="truncate">{away}</span>
      </span>
      <span className="shrink-0">
        {formatKickoff(match.kickoffAt, DISPLAY_TIME_ZONE)}
      </span>
    </div>
  );
}
