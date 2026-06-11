import { MarkdownLite } from "@/components/chat/markdown-lite";
import { ProposedBetCard } from "@/components/chat/proposed-bet-card";
import { ToolChip } from "@/components/chat/tool-chip";
import { parseAssistantBlocks } from "@/lib/chat/assistant-blocks";

/** The slice of a chatMessages doc the bubble renders. */
export interface ChatMessageView {
  _id: string;
  role: string;
  text: string;
  blocks?: unknown;
}

/**
 * One persisted message (mockup step 3): user bubbles right on the input
 * surface, assistant bubbles left on the card surface with the finished
 * tool-chip trace above and proposed-bet cards + error markers inside.
 */
export function MessageBubble({ message }: { message: ChatMessageView }) {
  if (message.role === "user") {
    return (
      <div className="rounded-card rounded-br-sm bg-input ml-12 self-end px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap">
        {message.text}
      </div>
    );
  }

  const trace = parseAssistantBlocks(message.blocks);
  return (
    <div className="flex flex-col gap-2">
      {trace.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {trace.chips.map((chip) => (
            <ToolChip
              key={chip.key}
              name={chip.name}
              detail={chip.detail}
              status="done"
              isError={chip.isError}
            />
          ))}
        </div>
      )}
      <div className="rounded-card rounded-bl-sm border-border bg-card mr-6 space-y-2 border px-3.5 py-2.5 text-sm leading-relaxed">
        <MarkdownLite text={message.text} />
        {trace.proposedBets.map((bet, index) => (
          <ProposedBetCard key={index} bet={bet} />
        ))}
        {trace.errorMarkers.map((marker, index) => (
          <p key={index} className="text-destructive text-xs">
            {marker}
          </p>
        ))}
      </div>
    </div>
  );
}
