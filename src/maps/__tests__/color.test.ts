import { describe, expect, it } from "vitest";
import { hexToRgba, rgbaToHex } from "../color";

describe("hexToRgba", () => {
  it("converts pure colors correctly", () => {
    expect(hexToRgba("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(hexToRgba("#00ff00")).toEqual([0, 1, 0, 1]);
    expect(hexToRgba("#0000ff")).toEqual([0, 0, 1, 1]);
  });

  it("black and white round-trip exactly", () => {
    expect(hexToRgba("#000000")).toEqual([0, 0, 0, 1]);
    expect(hexToRgba("#ffffff")).toEqual([1, 1, 1, 1]);
  });
});

describe("rgbaToHex", () => {
  it("is the inverse of hexToRgba for exact byte values", () => {
    expect(rgbaToHex(hexToRgba("#80592a"))).toBe("#80592a");
    expect(rgbaToHex(hexToRgba("#ffffff"))).toBe("#ffffff");
    expect(rgbaToHex(hexToRgba("#000000"))).toBe("#000000");
  });

  it("clamps out-of-range floats instead of producing invalid hex", () => {
    expect(rgbaToHex([1.5, -0.2, 0.5, 1])).toBe("#ff0080");
  });
});
