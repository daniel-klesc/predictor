import { Hammer, Loader2, Search } from "lucide-react";

import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

const RUNNING_LABELS: Record<string, string> = en.chat.tools.running;

/**
 * Compact tool-progress chip (mockup step 3): a friendly verb label with a
 * spinner while the tool runs ("Checking odds…"), collapsing to the tool
 * name + compact arg summary once finished ("get_match_analysis #1").
 * web_search gets the search glyph.
 */
export function ToolChip({
  name,
  detail,
  status,
  isError,
}: {
  name: string;
  detail: string;
  status: "running" | "done";
  isError?: boolean;
}) {
  const running = status === "running";
  const label = running
    ? (RUNNING_LABELS[name] ?? en.chat.tools.fallbackRunning(name))
    : name;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        isError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-card text-muted-foreground",
        running && "animate-pulse",
      )}
    >
      {running ? (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      ) : name === "web_search" ? (
        <Search className="size-3 shrink-0" aria-hidden />
      ) : (
        <Hammer className="size-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">
        {label}
        {detail !== "" && <span className="opacity-80"> {detail}</span>}
      </span>
    </span>
  );
}
