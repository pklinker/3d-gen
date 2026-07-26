// Geometry grouping + material-slot pairing. Pure geometry construction, no renderer, so it
// runs in the "node" environment the rest of the suite uses.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySurfaces, box, buildGeometry, radialFor } from "../primitives";
import { facet } from "../proceduralEngine";
import { conformGeometry, makeContractMaterial } from "../conform";
import { SURFACE_ORDER, surfaceIndex, finishSpec } from "../../contract/surfaces";
import { MESH_CONTRACTS } from "../../contract/constants";
import { ARTIFACTS } from "../../artifacts/registry";
import { defaultParams } from "../../types";

/** Three stacked boxes, so there are three obvious index ranges to hand out. */
function threeParts(): { geo: THREE.BufferGeometry; marks: number[] } {
  const P: number[] = [], I: number[] = [];
  const marks = [I.length];
  box(P, I, -1, 1, 0, 1, -1, 1); marks.push(I.length);
  box(P, I, -1, 1, 1, 2, -1, 1); marks.push(I.length);
  box(P, I, -1, 1, 2, 3, -1, 1); marks.push(I.length);
  return { geo: facet(buildGeometry(P, I)), marks };
}

/** Do the groups tile [0, vertexCount) exactly — no gap, no overlap? */
function coversExactly(geo: THREE.BufferGeometry): boolean {
  const total = geo.getAttribute("position").count;
  const sorted = [...geo.groups].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const g of sorted) {
    if (g.start !== cursor) return false;
    cursor += g.count;
  }
  return cursor === total;
}

describe("applySurfaces", () => {
  it("fills gaps with the fallback so the groups tile the whole mesh", () => {
    // Only the middle part is named; a mesh with groups renders ONLY its grouped ranges, so
    // the unnamed first and third parts must still come back covered.
    const { geo, marks } = threeParts();
    applySurfaces(geo, [{ start: marks[1], end: marks[2], finish: "brass" }], "stone");
    expect(coversExactly(geo)).toBe(true);
    const finishes = geo.groups.map((g) => SURFACE_ORDER[g.materialIndex!]);
    expect(finishes).toEqual(["stone", "brass", "stone"]);
  });

  it("collapses equal neighbours into one group", () => {
    // Adjacent ranges with the same finish are one draw call and one glTF primitive.
    const { geo, marks } = threeParts();
    applySurfaces(geo, [
      { start: marks[0], end: marks[1], finish: "metal" },
      { start: marks[1], end: marks[2], finish: "metal" },
      { start: marks[2], end: marks[3], finish: "metal" },
    ], "stone");
    expect(geo.groups).toHaveLength(1);
    expect(SURFACE_ORDER[geo.groups[0].materialIndex!]).toBe("metal");
  });

  it("lets a later range win where they overlap", () => {
    const { geo, marks } = threeParts();
    applySurfaces(geo, [
      { start: marks[0], end: marks[3], finish: "metal" },
      { start: marks[1], end: marks[2], finish: "brass" },
    ], "stone");
    expect(coversExactly(geo)).toBe(true);
    expect(geo.groups.map((g) => SURFACE_ORDER[g.materialIndex!])).toEqual([
      "metal", "brass", "metal",
    ]);
  });

  it("declaring no ranges leaves the geometry ungrouped", () => {
    // Which is the signal makeContractMaterial reads to hand back a single material.
    const { geo } = threeParts();
    applySurfaces(geo, [], "stone");
    expect(geo.groups).toHaveLength(0);
  });
});

describe("makeContractMaterial", () => {
  it("returns one material for an ungrouped geometry", () => {
    const { geo } = threeParts();
    const mat = makeContractMaterial("hill", geo);
    expect(Array.isArray(mat)).toBe(false);
    expect((mat as THREE.MeshStandardMaterial).roughness).toBe(MESH_CONTRACTS.hill.roughness);
  });

  it("returns the full slot array for a grouped geometry, indexable by materialIndex", () => {
    const { geo, marks } = threeParts();
    applySurfaces(geo, [{ start: marks[1], end: marks[2], finish: "brass" }], "stone");
    const mat = makeContractMaterial("battleship", geo) as THREE.MeshStandardMaterial[];
    expect(mat).toHaveLength(SURFACE_ORDER.length);
    const brass = mat[surfaceIndex("brass")];
    expect(brass.name).toBe("brass");
    expect(brass.metalness).toBe(finishSpec("brass", MESH_CONTRACTS.battleship).metalness);
  });

  it("resolves the `default` slot to the contract's own pair", () => {
    const C = MESH_CONTRACTS.radarDome;
    const spec = finishSpec("default", C);
    expect(spec).toEqual({ metalness: C.metalness, roughness: C.roughness });
  });
});

describe("surface groups through the conform pipeline", () => {
  const meshArtifacts = ARTIFACTS.filter((a) => a.output === "mesh");

  it.each(meshArtifacts.map((a) => [a.type, a] as const))(
    "%s keeps exact group coverage after conform",
    (_type, a) => {
      const p = defaultParams(a.params) as Record<string, unknown>;
      if (a.category === "buildings") p.ornament = 0.4;
      const raw = a.generate(1, p as never) as { geometry: THREE.BufferGeometry };
      const { geometry } = conformGeometry(raw.geometry, a.contract!, { category: a.category });
      // Groups survive clone/toNonIndexed/translate/scale; if an artifact declared any, they
      // must still tile the conformed mesh or triangles silently stop rendering.
      if (geometry.groups.length > 0) expect(coversExactly(geometry)).toBe(true);
      const mat = makeContractMaterial(a.contract!, geometry);
      expect(Array.isArray(mat)).toBe(geometry.groups.length > 0);
    },
  );

  it("drops groups when decimation rebuilds the geometry", () => {
    // SimplifyModifier returns a fresh position-only geometry, so ranges can't survive.
    // Falling back to one material is correct; carrying stale groups would mis-assign them.
    const { geo, marks } = threeParts();
    applySurfaces(geo, [{ start: marks[1], end: marks[2], finish: "brass" }], "stone");
    expect(geo.groups.length).toBeGreaterThan(0);
    const { geometry, report } = conformGeometry(geo, "hill", { category: "terrain" });
    if (report.decimated) {
      expect(geometry.groups).toHaveLength(0);
      expect(Array.isArray(makeContractMaterial("hill", geometry))).toBe(false);
    }
  });
});

describe("radialFor — detail proportional to on-screen size", () => {
  it("leaves small features at the caller's count", () => {
    // A 0.018-radius gun barrel is ~2px across in the game's 192px bake; subdividing it
    // further is triangles nobody can see.
    expect(radialFor(0.018, 6)).toBe(6);
    expect(radialFor(0.01, 8)).toBe(8);
    // The break-even for a caller asking 8 is a radius of ~0.048 — a nacelle sits right on
    // it and picks up a side or two, which is the boundary behaving as intended.
    expect(radialFor(0.05, 8)).toBe(9);
  });

  it("raises large features that would visibly polygonise", () => {
    expect(radialFor(0.15, 8)).toBeGreaterThan(8);   // a radome
    expect(radialFor(0.3, 8)).toBeGreaterThan(16);   // a broad drum
  });

  it("treats the caller's count as a floor, never a ceiling", () => {
    // A 4-sided propeller blade must stay a blade, not become a rod.
    expect(radialFor(0.001, 4)).toBe(4);
    expect(radialFor(0.5, 32)).toBe(32);
  });

  it("caps so a very large radius can't run away", () => {
    expect(radialFor(50, 6)).toBe(24);
  });
});
