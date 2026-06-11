import Link from "next/link";

import {
  type ProposedBetView,
  proposedBetTitle,
} from "@/lib/chat/assistant-blocks";
import { en } from "@/lib/strings/en";

/**
 * Proposed-bet card inside an assistant bubble (mockup step 3, adapted):
 * the propose_bet tool has ALREADY written the proposal server-side, so the
 * card confirms it ("Proposed") and links into the Bets flow instead of
 * offering an Add action — reflecting the tool's actual semantics.
 */
export function ProposedBetCard({ bet }: { bet: ProposedBetView }) {
  const subtitle = [en.chat.proposedBet.tag, bet.match, bet.bookmaker]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="border-primary/40 bg-primary/5 rounded-tile flex items-center justify-between gap-2 border px-3 py-2.5">
      <div className="min-w-0">
        <div className="font-display truncate text-sm font-bold uppercase">
          {proposedBetTitle(bet)}
        </div>
        <div className="text-muted-foreground truncate text-xs">{subtitle}</div>
      </div>
      <Link
        href="/bets"
        className="bg-primary text-primary-foreground font-display shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase"
      >
        {en.chat.proposedBet.viewInBets}
      </Link>
    </div>
  );
}
