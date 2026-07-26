// bakeAmbientOcclusion only builds and traverses geometry (no renderer, no canvas), so it
// runs in the "node" environment the rest of the suite uses.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bakeAmbientOcclusion, sitsOnGround } from "../ambientOcclusion";
import { facet } from "../proceduralEngine";
import { box, buildGeometry } from "../primitives";

/**
 * A slab with a wall standing on it, forming one inside corner along z = 0. Vertices in that
 * corner should darken; the far edge of the slab should not. Built through the same
 * primitives + facet() path the artifact generators use.
 */
function corner(): THREE.BufferGeometry {
  const P: number[] = [];
  const I: number[] = [];
  box(P, I, -1, 1, 0, 0.1, -1, 1);      // floor slab
  box(P, I, -1, 1, 0.1, 1, -0.1, 0.1);  // wall standing on it at z = 0
  const geo = facet(buildGeometry(P, I));
  const n = geo.getAttribute("position").count;
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

/** Mean color multiplier over vertices matching a predicate. */
function meanAt(
  geo: THREE.BufferGeometry,
  where: (x: number, y: number, z: number) => boolean,
): number {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  let sum = 0, n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (!where(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    sum += col.getX(i); n++;
  }
  return n ? sum / n : NaN;
}

describe("bakeAmbientOcclusion", () => {
  it("darkens an inside corner more than open floor", () => {
    const geo = corner();
    bakeAmbientOcclusion(geo, { groundPlane: false });
    // Floor vertices hard against the wall vs. those out at the slab's far edge.
    const inCorner = meanAt(geo, (_x, y, z) => y <= 0.11 && Math.abs(z) < 0.2);
    const openFloor = meanAt(geo, (_x, y, z) => y <= 0.11 && Math.abs(z) > 0.9);
    expect(inCorner).toBeLessThan(openFloor);
  });

  it("never brightens, and never darkens past minLight", () => {
    const geo = corner();
    bakeAmbientOcclusion(geo, { minLight: 0.5 });
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) {
      expect(col.getX(i)).toBeLessThanOrEqual(1);
      expect(col.getX(i)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    }
  });

  it("is deterministic — the same geometry bakes byte-identical colors", () => {
    const a = corner(), b = corner();
    bakeAmbientOcclusion(a);
    bakeAmbientOcclusion(b);
    expect(a.getAttribute("color").array).toEqual(b.getAttribute("color").array);
  });

  it("groundPlane darkens the underside; without it the mesh is unaffected by Y=0", () => {
    const grounded = corner(), airborne = corner();
    bakeAmbientOcclusion(grounded, { groundPlane: true });
    bakeAmbientOcclusion(airborne, { groundPlane: false });
    const low = (_x: number, y: number) => y <= 0.11;
    expect(meanAt(grounded, low)).toBeLessThan(meanAt(airborne, low));
  });

  it("leaves the geometry non-indexed — the BVH must not reorder the artifact", () => {
    // MeshBVH calls setIndex() on whatever geometry it is handed and sorts that index in
    // place. paintRange() depends on index order matching vertex order after facet(), so the
    // BVH has to be built on a throwaway geometry, not on the artifact itself.
    const geo = corner();
    const before = (geo.getAttribute("position").array as Float32Array).slice();
    bakeAmbientOcclusion(geo);
    expect(geo.index).toBeNull();
    expect(geo.getAttribute("position").array).toEqual(before);
  });

  it("is a no-op on geometry carrying no vertex colors", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, 0, 1, -1, 1);
    const geo = facet(buildGeometry(P, I));
    expect(() => bakeAmbientOcclusion(geo)).not.toThrow();
    expect(geo.getAttribute("color")).toBeUndefined();
  });

  it("intensity 0 leaves colors untouched", () => {
    const geo = corner();
    bakeAmbientOcclusion(geo, { intensity: 0 });
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBe(1);
  });
});

describe("sitsOnGround", () => {
  it("is true for what stands on the field and false for what flies over it", () => {
    expect(sitsOnGround("terrain")).toBe(true);
    expect(sitsOnGround("buildings")).toBe(true);
    // A craft's Y=0 contact is only the editor's anchoring convention.
    expect(sitsOnGround("ships")).toBe(false);
    expect(sitsOnGround("ordnance")).toBe(false);
  });
});
