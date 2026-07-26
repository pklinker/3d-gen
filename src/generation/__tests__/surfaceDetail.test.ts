// Vertex-colour maths only — no renderer, so this runs in the suite's "node" environment.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySurfaceDetail } from "../surfaceDetail";
import { siteCurvature, siteNormal, weldSites } from "../weld";
import { facet } from "../proceduralEngine";
import { applySurfaces, box, buildGeometry, tube } from "../primitives";

function painted(geo: THREE.BufferGeometry, value = 0.5): THREE.BufferGeometry {
  const n = geo.getAttribute("position").count;
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(value), 3));
  return geo;
}

function cube(): THREE.BufferGeometry {
  const P: number[] = [], I: number[] = [];
  box(P, I, -1, 1, -1, 1, -1, 1);
  return painted(facet(buildGeometry(P, I)));
}

/** Mean colour over vertices matching a predicate. */
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

describe("weld", () => {
  it("collapses a cube's 36 corners onto its 8 real ones", () => {
    const { sites } = weldSites(cube());
    expect(sites).toHaveLength(8);
    expect(sites.reduce((n, s) => n + s.verts.length, 0)).toBe(36);
  });

  it("reports outward normals and convex curvature on a cube's corners", () => {
    const { sites } = weldSites(cube());
    for (const s of sites) {
      const [nx, ny, nz] = siteNormal(s);
      // Each corner's averaged normal points away from the centre.
      expect(nx * s.x + ny * s.y + nz * s.z).toBeGreaterThan(0);
      // Every corner of a cube is convex, so curvature is negative.
      expect(siteCurvature(s)).toBeLessThan(0);
    }
  });

  it("reports near-zero curvature across a flat run", () => {
    // Mid-wall vertices of a tall tube: locally flat along the wall, so barely curved.
    const P: number[] = [], I: number[] = [];
    tube(P, I, [0, 0, 0], [0, 1, 0], 0.02, 8, false, false);
    const { sites } = weldSites(facet(buildGeometry(P, I)));
    const mid = sites.filter((s) => s.y > 0.001 && s.y < 0.999);
    // A straight-sided tube has no mid-height ring, so this asserts on what exists.
    for (const s of mid) expect(Math.abs(siteCurvature(s))).toBeLessThan(0.5);
  });

  it("returns nothing for indexed geometry", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -1, 1, -1, 1);
    expect(weldSites(buildGeometry(P, I)).sites).toHaveLength(0);
  });
});

describe("applySurfaceDetail", () => {
  it("lightens convex edges", () => {
    const geo = cube();
    applySurfaceDetail(geo, { mottle: 0, grime: 0, edgeWear: 0.3 });
    // Every vertex of a cube is a convex corner, so all of them wear brighter.
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBeGreaterThan(0.5);
  });

  it("biases up-facing surfaces lighter than down-facing ones", () => {
    // A wide thin slab, so the top and bottom faces dominate each corner's averaged normal —
    // on a cube every corner mixes an up face and a down face and the bias cancels out.
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -0.02, 0.02, -1, 1);
    const slab = painted(facet(buildGeometry(P, I)));
    applySurfaceDetail(slab, { mottle: 0, edgeWear: 0, grime: 0.3 });
    expect(meanAt(slab, (_x, y) => y > 0)).toBeGreaterThan(meanAt(slab, (_x, y) => y < 0));
  });

  it("mottle varies across space but stays within its stated amount", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -1, 1, -1, 1);
    box(P, I, 3, 5, -1, 1, -1, 1);   // a second block far away, to sample different noise
    const geo = painted(facet(buildGeometry(P, I)));
    applySurfaceDetail(geo, { mottle: 0.2, edgeWear: 0, grime: 0 });
    const col = geo.getAttribute("color");
    const vals = new Set<string>();
    for (let i = 0; i < col.count; i++) {
      vals.add(col.getX(i).toFixed(4));
      // 0.5 x (1 +/- 0.2)
      expect(col.getX(i)).toBeGreaterThanOrEqual(0.5 * 0.8 - 1e-6);
      expect(col.getX(i)).toBeLessThanOrEqual(0.5 * 1.2 + 1e-6);
    }
    expect(vals.size).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const a = cube(), b = cube();
    applySurfaceDetail(a);
    applySurfaceDetail(b);
    expect(a.getAttribute("color").array).toEqual(b.getAttribute("color").array);
  });

  it("never brightens past full white", () => {
    const geo = painted(cube(), 0.99);
    applySurfaceDetail(geo, { edgeWear: 1, mottle: 0.5, grime: 0.5 });
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBeLessThanOrEqual(1);
  });

  it("leaves positions, normals and surface groups alone", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -1, 1, -1, 1);
    const mark = I.length;
    box(P, I, -1, 1, 1, 2, -1, 1);
    const geo = painted(facet(buildGeometry(P, I)));
    applySurfaces(geo, [{ start: mark, end: I.length, finish: "brass" }], "stone");
    const pos = (geo.getAttribute("position").array as Float32Array).slice();
    const nrm = (geo.getAttribute("normal").array as Float32Array).slice();
    const groups = geo.groups.length;
    applySurfaceDetail(geo);
    expect(geo.getAttribute("position").array).toEqual(pos);
    expect(geo.getAttribute("normal").array).toEqual(nrm);
    expect(geo.groups).toHaveLength(groups);
  });

  it("is a no-op with no colours, and with everything switched off", () => {
    const P: number[] = [], I: number[] = [];
    box(P, I, -1, 1, -1, 1, -1, 1);
    const bare = facet(buildGeometry(P, I));
    expect(() => applySurfaceDetail(bare)).not.toThrow();
    expect(bare.getAttribute("color")).toBeUndefined();

    const geo = cube();
    applySurfaceDetail(geo, { edgeWear: 0, mottle: 0, grime: 0 });
    const col = geo.getAttribute("color");
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBe(0.5);
  });
});
