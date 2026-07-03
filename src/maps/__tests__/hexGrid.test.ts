import { describe, expect, it } from "vitest";
import { axialToWorld, boardBounds, cellKey, hexCorners, worldToAxial } from "../hexGrid";

describe("axialToWorld / worldToAxial", () => {
  it("are mutual inverses for the hex origin and its immediate neighbors", () => {
    const neighbors = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 1 },
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: -1, r: 1 },
    ];
    for (const { q, r } of neighbors) {
      const { x, z } = axialToWorld(q, r);
      expect(worldToAxial(x, z)).toEqual({ q, r });
    }
  });

  it("round-trips a grid of hexes at a larger board scale (48x48)", () => {
    for (let q = 0; q < 48; q += 7) {
      for (let r = 0; r < 48; r += 7) {
        const { x, z } = axialToWorld(q, r);
        expect(worldToAxial(x, z)).toEqual({ q, r });
      }
    }
  });

  it("a world point exactly on a hex center resolves to that hex, not a neighbor", () => {
    const { x, z } = axialToWorld(5, 3);
    expect(worldToAxial(x, z)).toEqual({ q: 5, r: 3 });
  });

  it("a world point nudged slightly toward a neighbor still resolves to the nearer hex", () => {
    const center = axialToWorld(2, 2);
    const nudged = worldToAxial(center.x + 0.05, center.z + 0.02);
    expect(nudged).toEqual({ q: 2, r: 2 }); // small nudge stays within the same cell
  });
});

describe("hexCorners", () => {
  it("returns 6 points at unit circumradius (pointy-top)", () => {
    const corners = hexCorners(1);
    expect(corners.length).toBe(6);
    for (const c of corners) {
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(1, 10);
    }
  });

  it("scales with size", () => {
    const corners = hexCorners(2.5);
    for (const c of corners) {
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(2.5, 10);
    }
  });
});

describe("cellKey", () => {
  it("is stable and distinct per (q, r)", () => {
    expect(cellKey(3, 4)).toBe("3,4");
    expect(cellKey(3, 4)).not.toBe(cellKey(4, 3));
  });
});

describe("boardBounds", () => {
  it("centers on the board (not the origin) — the camera-framing bug this fixes", () => {
    // A board whose (0,0) corner is at the world origin still has a centroid
    // well away from the origin once it's more than a few hexes wide; a camera
    // that always looks at (0,0,0) would show only the near corner.
    const b = boardBounds(20, 20);
    expect(b.cx).toBeGreaterThan(5);
    expect(b.cz).toBeGreaterThan(5);
  });

  it("grows with board size", () => {
    const small = boardBounds(4, 4);
    const large = boardBounds(40, 40);
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.depth).toBeGreaterThan(small.depth);
  });

  it("the margin expands the box past the outermost hex centers", () => {
    const noMargin = boardBounds(5, 5, 1, 0);
    const withMargin = boardBounds(5, 5, 1, 2);
    expect(withMargin.minX).toBeLessThan(noMargin.minX);
    expect(withMargin.maxX).toBeGreaterThan(noMargin.maxX);
  });

  it("a degenerate 1x1 board still produces a valid (non-inverted) box", () => {
    const b = boardBounds(1, 1);
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxZ).toBeGreaterThan(b.minZ);
  });
});
