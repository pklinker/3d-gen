// buildKindMesh imports three.js, but only to BUILD geometry (no renderer, no
// canvas), which is pure math and runs fine in the "node" environment the rest
// of the suite uses.

import { describe, expect, it } from "vitest";
import { buildKindMesh } from "../kindMesh";
import { deriveKindDocFromArtifact } from "../autoKind";
import type { TerrainKindDoc } from "../types";

function positionsOf(kind: TerrainKindDoc): Float32Array {
  const mesh = buildKindMesh(kind);
  if (!mesh) throw new Error("expected a mesh");
  return mesh.geometry.getAttribute("position").array as Float32Array;
}

describe("buildKindMesh — variant tuning", () => {
  const stock = deriveKindDocFromArtifact("mossdunes");

  it("builds the generator's default mesh when a kind carries no variant tuning", () => {
    // Deterministic: same kind in, same geometry out (seed 1 + defaults).
    expect(positionsOf(stock)).toEqual(positionsOf({ ...stock }));
  });

  it("a variant seed produces a different mesh from the default one", () => {
    expect(positionsOf({ ...stock, generatorSeed: 99 })).not.toEqual(positionsOf(stock));
  });

  it("variant params reach the generator", () => {
    const flat = positionsOf({ ...stock, generatorParams: { height: 0.15, frequency: 2 } });
    const peaked = positionsOf({ ...stock, generatorParams: { height: 0.6, frequency: 9 } });
    expect(flat).not.toEqual(peaked);
  });

  it("partial variant params fall back to defaults for the keys they omit", () => {
    // A variant saved before a param existed must still build, not crash on an
    // undefined param.
    expect(() => positionsOf({ ...stock, generatorParams: { frequency: 5 } })).not.toThrow();
  });

  it("still returns null for a kind with no generator or an effect-backed one", () => {
    expect(buildKindMesh({ ...stock, generatorType: undefined, id: "plain" })).toBeNull();
    expect(buildKindMesh({ ...stock, generatorType: "duststorm" })).toBeNull();
  });
});
