import { en } from "@/lib/strings/en";

const SUGGESTIONS = [
  en.chat.suggestions.todayValue,
  en.chat.suggestions.outrightValue,
  en.chat.suggestions.bestTonight,
] as const;

/** One-tap starting prompts (mockup step 3) — tap = send that prompt. */
export function SuggestionChips({
  onPick,
  disabled,
}: {
  onPick(text: string): void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          className="border-border bg-card text-muted-foreground hover:text-foreground rounded-full border px-3 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
