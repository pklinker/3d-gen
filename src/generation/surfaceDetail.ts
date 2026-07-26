import * as THREE from "three";
import { hashCoords, siteCurvature, siteNormal, weldSites } from "./weld";

/**
 * Albedo detail — variation painted into the vertex colors rather than built from triangles.
 *
 * This pass exists because of what the geometry measurements showed. The game blits each
 * model at 192px, and at that size doubling a ship's triangle count moved 2.3% of its sprite
 * pixels (see TODO_REALISM.md §4). Albedo is the opposite trade: it costs no triangles at
 * all, it survives the bake exactly as the baked AO does — it *is* the same `color` attribute
 * — and it changes pixels across the whole silhouette rather than only along a few edges.
 *
 * Three effects, all multiplicative over whatever palette the generator painted:
 *
 *  - **Edge wear.** Convex edges lighten, as if paint has rubbed off a corner and stone has
 *    chipped. Reads as the exact inverse of ambient occlusion, which darkens the concave
 *    creases, and the two together are what make a form look handled rather than extruded.
 *  - **Mottle.** Coherent 3D value noise, so large flat areas stop being uniformly flat.
 *    Deliberately low-frequency: a blotch has to be several pixels across at 192px to survive
 *    the bake, so the feature size is specified in mesh-relative units and defaults to
 *    something a sprite can actually resolve.
 *  - **Grime.** A downward bias — surfaces facing up collect dust, undersides stay in shadow
 *    colour. Cheap directional weathering that needs no ray casting.
 *
 * All three are deterministic functions of position, so no seed is threaded through: two
 * artifacts with different geometry get different detail, and re-running the same generator
 * reproduces it exactly.
 */

export interface SurfaceDetailOptions {
  /** How much convex edges lighten, 0 … 1. */
  edgeWear?: number;
  /** Strength of the coherent mottle, 0 … 1 (a ±fraction of albedo). */
  mottle?: number;
  /** Mottle feature size, as a fraction of the bounding-box diagonal. */
  mottleScale?: number;
  /** Strength of the up/down grime bias, 0 … 1. */
  grime?: number;
}

const DEFAULTS: Required<SurfaceDetailOptions> = {
  edgeWear: 0.22,
  mottle: 0.13,
  // ~1/6 of the model. At 192px across ~2.4 units that is a blotch roughly 30px wide — big
  // enough to read after the bake. Anything much finer averages away to flat grey.
  mottleScale: 0.17,
  grime: 0.1,
};

/** Smoothstep, for blending noise cells without a visible lattice. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise in 3D: hash the eight corners of the containing lattice cell and trilinearly
 * interpolate with a smoothstep fade. Returns 0 … 1.
 *
 * Value noise rather than a per-facet random number because per-facet randomness is white
 * noise — at sprite scale it averages to a flat tone and contributes nothing. Coherent noise
 * survives downsampling, which is the entire point of doing this.
 */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const tx = smooth(x - xi), ty = smooth(y - yi), tz = smooth(z - zi);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w =
          (dx ? tx : 1 - tx) *
          (dy ? ty : 1 - ty) *
          (dz ? tz : 1 - tz);
        if (w > 0) acc += w * hashCoords(xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return acc;
}

/**
 * Multiply albedo detail into `geo`'s vertex colors, in place.
 *
 * Expects the faceted (non-indexed) geometry `facet()` produces, already carrying a `color`
 * attribute — this scales existing albedo rather than creating it. A geometry missing either
 * is left untouched.
 */
export function applySurfaceDetail(
  geo: THREE.BufferGeometry,
  opts: SurfaceDetailOptions = {},
): void {
  const o = { ...DEFAULTS, ...opts };
  const col = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!col || !pos || geo.index) return;
  if (o.edgeWear <= 0 && o.mottle <= 0 && o.grime <= 0) return;

  const { sites, diag } = weldSites(geo);
  if (sites.length === 0) return;

  // Noise is sampled in units of the feature size, so the pattern scales with the model
  // instead of getting finer as an artifact gets bigger.
  const freq = 1 / (diag * o.mottleScale);

  for (const site of sites) {
    let m = 1;

    if (o.edgeWear > 0) {
      // Curvature is negative on convex corners; only those wear. Concave creases are left
      // to the AO pass, which already darkens them — doubling up here would crush them.
      const c = siteCurvature(site);
      if (c < 0) m += o.edgeWear * Math.min(1, -c);
    }

    if (o.mottle > 0) {
      const n = valueNoise(site.x * freq, site.y * freq, site.z * freq);
      m *= 1 + (n - 0.5) * 2 * o.mottle;
    }

    if (o.grime > 0) {
      // Up-facing surfaces collect dust and read lighter; undersides sit in bounce and read
      // darker. A plain normal-Y term, no rays needed.
      const [, ny] = siteNormal(site);
      m *= 1 + ny * o.grime;
    }

    if (m === 1) continue;
    for (const vi of site.verts) {
      col.setXYZ(
        vi,
        Math.min(1, col.getX(vi) * m),
        Math.min(1, col.getY(vi) * m),
        Math.min(1, col.getZ(vi) * m),
      );
    }
  }

  col.needsUpdate = true;
}
