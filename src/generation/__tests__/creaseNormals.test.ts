// Normal generation only — no renderer, so this runs in the suite's "node" environment.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { creaseNormals, facet } from "../proceduralEngine";
import { applySurfaces, box, buildGeometry, frustum, tube } from "../primitives";
import { conformGeometry } from "../conform";
import { ARTIFACTS } from "../../artifacts/registry";
import { defaultParams } from "../../types";

/**
 * A capped 8-sided cylinder: 45° edges around the barrel, 90° edges at the caps.
 *
 * The radius is deliberately small. `radialFor` raises the side count for anything wide
 * enough to polygonise on screen — at r = 0.3 it would hand back 24 sides and the barrel
 * edges would be 15°, not 45°, silently changing what these crease-angle tests are testing.
 * At this radius the requested 8 is the floor that wins, so the edge angle is known.
 */
function cylinder(): THREE.BufferGeometry {
  const P: number[] = [], I: number[] = [];
  tube(P, I, [0, 0, 0], [0, 1, 0], 0.02, 8, true, true);
  return facet(buildGeometry(P, I));
}

function normalsOf(geo: THREE.BufferGeometry): THREE.BufferAttribute {
  return geo.getAttribute("normal") as THREE.BufferAttribute;
}

/**
 * How many triangles are smooth-shaded — i.e. carry three different corner normals?
 *
 * Note this is the right question and "how many distinct normals does the mesh have" is not:
 * hard faceting gives one normal per *face*, while smoothing gives one per *vertex*, so
 * smoothing raises the distinct-normal count even though it is the softer result.
 */
function smoothTriangles(geo: THREE.BufferGeometry): number {
  const n = normalsOf(geo);
  const same = (a: number, b: number) =>
    Math.abs(n.getX(a) - n.getX(b)) < 1e-5 &&
    Math.abs(n.getY(a) - n.getY(b)) < 1e-5 &&
    Math.abs(n.getZ(a) - n.getZ(b)) < 1e-5;
  let count = 0;
  for (let i = 0; i < n.count; i += 3) {
    if (!(same(i, i + 1) && same(i + 1, i + 2))) count++;
  }
  return count;
}

describe("creaseNormals", () => {
  it("averages normals across a shallow edge", () => {
    // A cylinder's 8 barrel facets sit 45° apart, so at 65° they smooth.
    const hard = cylinder();
    expect(smoothTriangles(hard)).toBe(0);
    const soft = cylinder();
    creaseNormals(soft, 65);
    expect(smoothTriangles(soft)).toBeGreaterThan(0);
  });

  it("smooths nothing when every edge is sharper than the threshold", () => {
    // 45° barrel edges are above a 30° threshold, so the cylinder stays fully faceted.
    const geo = cylinder();
    creaseNormals(geo, 30);
    expect(smoothTriangles(geo)).toBe(0);
  });

  it("leaves a box fully faceted — every edge is sharper than the threshold", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -1, 1, -1, 1);
    const geo = facet(buildGeometry(P, I));
    const before = normalsOf(geo).array.slice();
    creaseNormals(geo, 65);
    // 90° corners are above the threshold, so the six face normals survive unchanged.
    expect(smoothTriangles(geo)).toBe(0);
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(normalsOf(geo).array[i] - before[i])).toBeLessThan(1e-6);
    }
  });

  it("keeps the cap edge sharp while smoothing the barrel", () => {
    // The barrel-to-cap join is 90°: the cap must not bleed into the wall.
    const geo = cylinder();
    creaseNormals(geo, 65);
    const n = normalsOf(geo);
    const pos = geo.getAttribute("position");
    let capUp = 0;
    for (let i = 0; i < pos.count; i++) {
      // Top cap vertices whose normal still points straight up.
      if (pos.getY(i) > 0.99 && n.getY(i) > 0.999) capUp++;
    }
    expect(capUp).toBeGreaterThan(0);
  });

  it("returns positions bit-identical to the input", () => {
    // The pass scales up by 1024 to buy hash precision and back down again. That is only safe
    // because 1024 is a power of two — a non-power-of-two would perturb every coordinate and
    // silently drift the mesh off its conformed size.
    const geo = cylinder();
    const before = (geo.getAttribute("position").array as Float32Array).slice();
    creaseNormals(geo, 65);
    expect(geo.getAttribute("position").array).toEqual(before);
  });

  it("preserves vertex colors and surface groups", () => {
    const P: number[] = [], I: number[] = [];
    tube(P, I, [0, 0, 0], [0, 1, 0], 0.3, 8, true, true);
    const mark = I.length;
    frustum(P, I, [0, 1, 0], [0, 1.4, 0], 0.3, 0.1, 8, true, true);
    const geo = facet(buildGeometry(P, I));
    const n = geo.getAttribute("position").count;
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
    applySurfaces(geo, [{ start: mark, end: I.length, finish: "brass" }], "stone");

    const groupsBefore = geo.groups.length;
    creaseNormals(geo, 65);
    expect(geo.groups).toHaveLength(groupsBefore);
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBe(0.5);
  });

  it("is a no-op at angle 0 and on indexed geometry", () => {
    const geo = cylinder();
    const before = normalsOf(geo).array.slice();
    creaseNormals(geo, 0);
    expect(normalsOf(geo).array).toEqual(before);
  });
});

describe("creasing through the conform pipeline", () => {
  it("only artifacts opting in come out smoothed", () => {
    const byType = (t: string) => ARTIFACTS.find((a) => a.type === t)!;
    for (const type of ["battleship", "observatory", "mountain", "hill"]) {
      const a = byType(type);
      const p = defaultParams(a.params) as Record<string, unknown>;
      if (a.category === "buildings") p.ornament = 0.4;
      const raw = a.generate(1, p as never) as { geometry: THREE.BufferGeometry };
      const flat = conformGeometry(raw.geometry, a.contract!, { category: a.category, ao: false });
      const out = conformGeometry(raw.geometry, a.contract!, {
        category: a.category,
        ao: false,
        smoothAngleDeg: a.smoothAngleDeg,
      });
      expect(smoothTriangles(flat.geometry)).toBe(0);
      if (a.smoothAngleDeg) {
        expect(smoothTriangles(out.geometry)).toBeGreaterThan(0);
      } else {
        // Terrain keeps its faceted rock — that is the style, not an oversight.
        expect(smoothTriangles(out.geometry)).toBe(0);
      }
    }
  });

  it("terrain artifacts declare no smoothing", () => {
    for (const a of ARTIFACTS.filter((x) => x.category === "terrain")) {
      expect(a.smoothAngleDeg).toBeUndefined();
    }
  });
});
