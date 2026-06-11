"use client";

import { SendHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { en } from "@/lib/strings/en";

/**
 * Rounded composer with the volt send button (mockup step 3). Enter submits
 * (native form submit). Typing stays enabled while a reply streams — only
 * sending is blocked. The input clears only after the parent accepts the
 * message (the user keeps their text when the send mutation fails).
 */
export function Composer({
  onSend,
  disabled,
}: {
  /** Resolves true when the message was persisted (clears the input). */
  onSend(text: string): Promise<boolean>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const canSend = !disabled && !pending && text.trim() !== "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!canSend || trimmed === "") return;
    setPending(true);
    try {
      if (await onSend(trimmed)) setText("");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="border-border bg-card flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-4"
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={en.chat.composer.placeholder}
        aria-label={en.chat.composer.placeholder}
        enterKeyHint="send"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <Button
        type="submit"
        size="icon-sm"
        className="rounded-full"
        disabled={!canSend}
        aria-label={en.chat.composer.send}
      >
        <SendHorizontal />
      </Button>
    </form>
  );
}
