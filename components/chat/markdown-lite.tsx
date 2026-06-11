import { Fragment, useMemo } from "react";

import { type MarkdownSpan, parseMarkdownLite } from "@/lib/chat/markdown-lite";

function Spans({ spans }: { spans: MarkdownSpan[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <strong key={index} className="text-primary font-semibold">
            {span.text}
          </strong>
        ) : (
          <Fragment key={index}>{span.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Markdown-lite renderer for assistant text: bold, lists, line breaks.
 * Spans render as React text nodes — HTML in the model output stays literal
 * (escaped by construction, no dangerouslySetInnerHTML anywhere).
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdownLite(text), [text]);
  return (
    <>
      {blocks.map((block, blockIndex) => {
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <Spans spans={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={blockIndex} className="list-decimal space-y-0.5 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={blockIndex} className="list-disc space-y-0.5 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={blockIndex} className="break-words">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <Spans spans={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
