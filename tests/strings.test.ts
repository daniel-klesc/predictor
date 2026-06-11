import { describe, expect, it } from "vitest";

import { en } from "@/lib/strings/en";

function collectLeaves(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") {
    return [[path.join("."), node]];
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      collectLeaves(value, [...path, key]),
    );
  }
  return [];
}

describe("strings module (en)", () => {
  it("has the four bottom-nav labels", () => {
    expect(en.nav.today).toBe("Today");
    expect(en.nav.matches).toBe("Matches");
    expect(en.nav.chat).toBe("Chat");
    expect(en.nav.bets).toBe("Bets");
  });

  it("has a screen title for every shell route", () => {
    expect(en.screens.today.title).toBeTruthy();
    expect(en.screens.matches.title).toBeTruthy();
    expect(en.screens.matchDetail.title).toBeTruthy();
    expect(en.screens.chat.title).toBeTruthy();
    expect(en.screens.chatThread.title).toBeTruthy();
    expect(en.screens.bets.title).toBeTruthy();
  });

  it("contains no empty strings anywhere", () => {
    const leaves = collectLeaves(en);
    expect(leaves.length).toBeGreaterThan(0);
    for (const [path, value] of leaves) {
      expect(value.trim(), `string at "${path}" is empty`).not.toBe("");
    }
  });
});
