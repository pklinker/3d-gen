import { describe, expect, it } from "vitest";
import { applyPaint, eraseCell, setCell } from "../paint";

describe("applyPaint", () => {
  it("paints a new cell onto an empty board", () => {
    expect(applyPaint([], 2, 3, "hill")).toEqual([{ q: 2, r: 3, kind: "hill" }]);
  });

  it("replaces the kind at an already-painted cell", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(applyPaint(cells, 2, 3, "tower")).toEqual([{ q: 2, r: 3, kind: "tower" }]);
  });

  it("clicking the same kind again on a painted cell erases it (toggle)", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(applyPaint(cells, 2, 3, "hill")).toEqual([]);
  });

  it("leaves other cells untouched", () => {
    const cells = [{ q: 0, r: 0, kind: "hill" }, { q: 1, r: 1, kind: "tower" }];
    const result = applyPaint(cells, 5, 5, "dust_storm");
    expect(result).toContainEqual({ q: 0, r: 0, kind: "hill" });
    expect(result).toContainEqual({ q: 1, r: 1, kind: "tower" });
    expect(result).toContainEqual({ q: 5, r: 5, kind: "dust_storm" });
  });

  it("the Eraser brush (null) removes a painted cell", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(applyPaint(cells, 2, 3, null)).toEqual([]);
  });

  it("the Eraser brush on an empty cell is a no-op", () => {
    const cells = [{ q: 0, r: 0, kind: "hill" }];
    expect(applyPaint(cells, 9, 9, null)).toEqual(cells);
  });

  it("never mutates the input array", () => {
    const cells = [{ q: 0, r: 0, kind: "hill" }];
    const frozen = Object.freeze([...cells]);
    expect(() => applyPaint(frozen as typeof cells, 0, 0, "tower")).not.toThrow();
    expect(cells).toEqual([{ q: 0, r: 0, kind: "hill" }]); // original untouched
  });
});

describe("setCell", () => {
  it("paints a new cell onto an empty board", () => {
    expect(setCell([], 2, 3, "hill")).toEqual([{ q: 2, r: 3, kind: "hill" }]);
  });

  it("re-entering a cell already painted with the same kind stays painted (no toggle)", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(setCell(cells, 2, 3, "hill")).toEqual(cells);
  });

  it("overwrites a different kind at that cell", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(setCell(cells, 2, 3, "tower")).toEqual([{ q: 2, r: 3, kind: "tower" }]);
  });

  it("never mutates the input array", () => {
    const cells = Object.freeze([{ q: 0, r: 0, kind: "hill" }]);
    expect(() => setCell(cells as { q: number; r: number; kind: string }[], 1, 1, "tower")).not.toThrow();
  });
});

describe("eraseCell", () => {
  it("removes a painted cell", () => {
    const cells = [{ q: 2, r: 3, kind: "hill" }];
    expect(eraseCell(cells, 2, 3)).toEqual([]);
  });

  it("is a no-op on an empty cell", () => {
    const cells = [{ q: 0, r: 0, kind: "hill" }];
    expect(eraseCell(cells, 9, 9)).toEqual(cells);
  });
});
