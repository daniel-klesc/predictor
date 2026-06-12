import { describe, expect, it } from "vitest";

import {
  impliedProbability,
  sparklinePath,
  sparklinePoints,
  sparklineTrend,
} from "@/lib/sparkline";

describe("impliedProbability", () => {
  it("inverts decimal odds", () => {
    expect(impliedProbability(2)).toBe(0.5);
    expect(impliedProbability(4)).toBe(0.25);
    expect(impliedProbability(1)).toBe(1);
  });

  it("guards non-positive odds", () => {
    expect(impliedProbability(0)).toBe(0);
    expect(impliedProbability(-1.5)).toBe(0);
  });
});

describe("sparklinePoints", () => {
  it("scales timestamps to x and values to y (max value on top)", () => {
    const points = sparklinePoints(
      [
        { t: 0, v: 0.2 },
        { t: 50, v: 0.5 },
        { t: 100, v: 0.8 },
      ],
      104,
      24,
      2,
    );
    expect(points).toEqual([
      { x: 2, y: 22 }, // min value → bottom
      { x: 52, y: 12 },
      { x: 102, y: 2 }, // max value → top
    ]);
  });

  it("spaces x by real time, not index", () => {
    const points = sparklinePoints(
      [
        { t: 0, v: 0 },
        { t: 10, v: 0 },
        { t: 100, v: 1 },
      ],
      102,
      20,
      1,
    );
    expect(points.map((p) => p.x)).toEqual([1, 11, 101]);
  });

  it("centers a flat series on the midline instead of dividing by zero", () => {
    const points = sparklinePoints(
      [
        { t: 0, v: 0.4 },
        { t: 100, v: 0.4 },
      ],
      100,
      24,
      2,
    );
    expect(points.map((p) => p.y)).toEqual([12, 12]);
  });

  it("centers identical timestamps horizontally", () => {
    const points = sparklinePoints(
      [
        { t: 5, v: 0.1 },
        { t: 5, v: 0.9 },
      ],
      100,
      24,
      2,
    );
    expect(points.map((p) => p.x)).toEqual([50, 50]);
  });

  it("returns an empty array for empty input", () => {
    expect(sparklinePoints([], 100, 24)).toEqual([]);
  });
});

describe("sparklinePath", () => {
  it("emits an M/L path", () => {
    const path = sparklinePath(
      [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
      ],
      10,
      10,
      0,
    );
    expect(path).toBe("M 0 10 L 10 0");
  });

  it("is empty for empty input", () => {
    expect(sparklinePath([], 10, 10)).toBe("");
  });
});

describe("sparklineTrend", () => {
  it("flags movement beyond epsilon", () => {
    expect(sparklineTrend(0.4, 0.45)).toBe("up");
    expect(sparklineTrend(0.45, 0.4)).toBe("down");
  });

  it("absorbs sub-epsilon wobble as flat", () => {
    expect(sparklineTrend(0.4, 0.404)).toBe("flat");
    expect(sparklineTrend(0.4, 0.397)).toBe("flat");
  });
});
