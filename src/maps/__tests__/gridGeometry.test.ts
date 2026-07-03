import { describe, expect, it } from "vitest";
import { buildFillGeometry, buildGridLinePositions, deployBandCells } from "../gridGeometry";

describe("buildGridLinePositions", () => {
  it("produces exactly 6 edges (12 points x 3 floats) per hex, for the whole board at once", () => {
    const cols = 5;
    const rows = 4;
    const positions = buildGridLinePositions(cols, rows);
    expect(positions.length).toBe(cols * rows * 6 * 2 * 3);
  });

  it("is a single flat array regardless of board size (one draw call's worth of data)", () => {
    const small = buildGridLinePositions(2, 2);
    const large = buildGridLinePositions(48, 48);
    expect(Array.isArray(small)).toBe(true);
    expect(large.length).toBe(48 * 48 * 6 * 2 * 3);
  });

  it("an empty board produces an empty array, not an error", () => {
    expect(buildGridLinePositions(0, 0)).toEqual([]);
  });
});

describe("deployBandCells", () => {
  it("covers the west and east bands, every row", () => {
    const cells = deployBandCells(10, 3, 2);
    // 2 cols west + 2 cols east, x3 rows = 12 cells (bands don't overlap here)
    expect(cells.length).toBe(12);
    expect(cells.some((c) => c.q === 0 && c.r === 0)).toBe(true);
    expect(cells.some((c) => c.q === 9 && c.r === 2)).toBe(true);
    expect(cells.some((c) => c.q === 5)).toBe(false); // middle untouched
  });

  it("a zero-width band tints nothing", () => {
    expect(deployBandCells(10, 3, 0)).toEqual([]);
  });

  it("a band covering the whole board does not double-count overlapping columns", () => {
    const cols = 6;
    const cells = deployBandCells(cols, 1, 10); // deployZoneCols way bigger than the board
    const seen = new Set(cells.map((c) => c.q));
    expect(seen.size).toBe(cols); // every column present exactly once
    expect(cells.length).toBe(cols); // no duplicates
  });

  it("a band of exactly half the board meets in the middle with no gap or overlap", () => {
    const cols = 8;
    const cells = deployBandCells(cols, 1, 4);
    const qs = cells.map((c) => c.q).sort((a, b) => a - b);
    expect(qs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // every column, once
  });
});

describe("buildFillGeometry", () => {
  it("produces one center + 6 corner vertices and 6 triangles per hex", () => {
    const cells = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }];
    const { positions, indices } = buildFillGeometry(cells);
    expect(positions.length).toBe(cells.length * 7 * 3); // 7 verts x 3 floats each
    expect(indices.length).toBe(cells.length * 6 * 3); // 6 tris x 3 indices each
  });

  it("an empty cell list produces empty geometry, not an error", () => {
    expect(buildFillGeometry([])).toEqual({ positions: [], indices: [] });
  });

  it("indices for the second hex are offset past the first hex's 7 vertices", () => {
    const { indices } = buildFillGeometry([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    // The second hex's center index must be 7 (0..6 belong to the first hex).
    expect(Math.min(...indices.slice(18))).toBeGreaterThanOrEqual(7);
  });
});
