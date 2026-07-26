import * as THREE from "three";

/**
 * Vertex welding for the faceted geometries `facet()` produces.
 *
 * After `toNonIndexed()` every triangle owns its three corners outright, so a corner shared
 * by six facets exists six times over. Every per-vertex shading pass — ambient occlusion,
 * edge wear, mottle — wants to reason about that corner *once* and then write the answer back
 * to all six duplicates, both because it is six times cheaper and because computing it
 * independently per duplicate would produce six slightly different answers and a visible
 * seam. This is that shared step.
 *
 * Corners that came from the same source vertex are bit-identical (they were one vertex
 * before the split), so a quantized key welds them exactly. The quantum is relative to the
 * bounding-box diagonal, which keeps it scale-independent: these meshes are measured in hex
 * circumradii, where an absolute epsilon tuned for model-scale geometry would be far too
 * coarse.
 */

export interface Site {
  /** Position of the welded corner. */
  x: number; y: number; z: number;
  /** Quantized position — the weld key, and a ready-made integer hash input. */
  qx: number; qy: number; qz: number;
  /**
   * Sum of adjacent face normals, area-weighted (an unnormalized face normal's length is
   * twice the triangle's area). Weighting by area is deliberate: a sliver facet should not
   * swing the orientation of a corner it barely touches. Normalize before use.
   */
  nx: number; ny: number; nz: number;
  /**
   * Sum of the positions of every corner reached by an edge from this one, and how many were
   * summed. The mean of those, measured against the site's own normal, gives the sign of the
   * local curvature — which is what separates a convex edge to be worn from a concave one to
   * be shaded.
   */
  ax: number; ay: number; az: number; adj: number;
  /** Every duplicate vertex index sitting at this position. */
  verts: number[];
}

export interface WeldResult {
  sites: Site[];
  /** Bounding-box diagonal — the natural scale for any distance threshold on this mesh. */
  diag: number;
}

/**
 * Weld a faceted geometry's duplicate corners. Returns an empty result for indexed geometry,
 * which by definition has no duplicates to merge and is not what this pipeline produces.
 */
export function weldSites(geo: THREE.BufferGeometry): WeldResult {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || geo.index) return { sites: [], diag: 1 };

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const diag = bb.min.distanceTo(bb.max) || 1;
  const keyScale = 1e5 / diag;

  const byKey = new Map<string, Site>();

  function corner(
    vi: number,
    nx: number, ny: number, nz: number,
    o1: number, o2: number,
  ): void {
    const px = pos!.getX(vi), py = pos!.getY(vi), pz = pos!.getZ(vi);
    const qx = Math.round(px * keyScale);
    const qy = Math.round(py * keyScale);
    const qz = Math.round(pz * keyScale);
    const key = `${qx},${qy},${qz}`;
    let s = byKey.get(key);
    if (!s) {
      s = {
        x: px, y: py, z: pz, qx, qy, qz,
        nx: 0, ny: 0, nz: 0,
        ax: 0, ay: 0, az: 0, adj: 0,
        verts: [],
      };
      byKey.set(key, s);
    }
    s.nx += nx; s.ny += ny; s.nz += nz;
    s.ax += pos!.getX(o1) + pos!.getX(o2);
    s.ay += pos!.getY(o1) + pos!.getY(o2);
    s.az += pos!.getZ(o1) + pos!.getZ(o2);
    s.adj += 2;
    s.verts.push(vi);
  }

  const triCount = pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = t * 3, b = a + 1, c = a + 2;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const ux = pos.getX(b) - ax, uy = pos.getY(b) - ay, uz = pos.getZ(b) - az;
    const vx = pos.getX(c) - ax, vy = pos.getY(c) - ay, vz = pos.getZ(c) - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    corner(a, nx, ny, nz, b, c);
    corner(b, nx, ny, nz, c, a);
    corner(c, nx, ny, nz, a, b);
  }

  return { sites: [...byKey.values()], diag };
}

/** Unit normal for a site, falling back to up for a fully degenerate corner. */
export function siteNormal(s: Site): [number, number, number] {
  const len = Math.hypot(s.nx, s.ny, s.nz);
  if (len < 1e-12) return [0, 1, 0];
  return [s.nx / len, s.ny / len, s.nz / len];
}

/**
 * Signed local curvature at a site, in [-1, 1]: negative on a convex edge (a ridge, an outer
 * corner), positive in a concave one (a crease, an inside corner), ~0 on flat surface.
 *
 * Measures where the neighbours sit relative to the tangent plane. On a convex corner they
 * fall away behind it, so the direction to their centroid opposes the normal.
 */
export function siteCurvature(s: Site): number {
  if (s.adj === 0) return 0;
  const mx = s.ax / s.adj - s.x;
  const my = s.ay / s.adj - s.y;
  const mz = s.az / s.adj - s.z;
  const len = Math.hypot(mx, my, mz);
  if (len < 1e-12) return 0;
  const [nx, ny, nz] = siteNormal(s);
  return (mx * nx + my * ny + mz * nz) / len;
}

/**
 * Integer hash (FNV-1a) over three quantized coordinates. Deliberately integer-only: a float
 * hash built on `Math.sin` — the usual shader idiom — rides on an implementation-defined
 * transcendental, and two engines disagreeing in the last ulp is enough to shift the result
 * visibly. Whole-number inputs and `imul` stay bit-identical everywhere, which is what the
 * rest of the generation pipeline promises.
 */
export function hashCoords(x: number, y: number, z: number): number {
  let h = 2166136261;
  h = Math.imul(h ^ (x | 0), 16777619);
  h = Math.imul(h ^ (y | 0), 16777619);
  h = Math.imul(h ^ (z | 0), 16777619);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
