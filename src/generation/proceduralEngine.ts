import * as THREE from "three";

/** Mulberry32 — small deterministic PRNG so a (seed, params) pair is reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert a string (e.g. a variant name) to a stable 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Apply vertex colors as a vertical gradient between two colors, so meshes read
 * with baked shading even under flat lighting. Adds a `color` attribute.
 */
export function applyVerticalGradient(
  geo: THREE.BufferGeometry,
  bottomHex: string,
  topHex: string,
): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const minY = bb.min.y;
  const maxY = bb.max.y || 1;
  const range = maxY - minY || 1;
  const pos = geo.getAttribute("position");
  const bottom = new THREE.Color(bottomHex);
  const top = new THREE.Color(topHex);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / range;
    c.copy(bottom).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export interface ColorStop {
  /** Normalized height 0 (base) … 1 (peak). */
  t: number;
  color: string;
}

/**
 * Paint vertex colors from height bands: a list of {t, color} stops interpolated by each
 * vertex's normalized height. Use for green slopes → grey rock → white snow caps, etc.
 * Stops must be sorted by t and span 0..1. Optional `jitter` adds a little per-vertex
 * variation so the bands don't read as hard contour lines.
 */
export function applyHeightBands(
  geo: THREE.BufferGeometry,
  stops: ColorStop[],
  rng?: () => number,
  jitter = 0,
): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const minY = bb.min.y;
  const range = (bb.max.y || 1) - minY || 1;
  const pos = geo.getAttribute("position");
  const cols = stops.map((s) => new THREE.Color(s.color));
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let t = (pos.getY(i) - minY) / range;
    if (jitter && rng) t = Math.min(1, Math.max(0, t + (rng() - 0.5) * jitter));
    // find the bracketing stops
    let hi = 1;
    while (hi < stops.length && stops[hi].t < t) hi++;
    if (hi >= stops.length) hi = stops.length - 1;
    const lo = hi - 1;
    const span = stops[hi].t - stops[lo].t || 1;
    const f = Math.min(1, Math.max(0, (t - stops[lo].t) / span));
    c.copy(cols[lo]).lerp(cols[hi], f);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Faceted look: split shared vertices and recompute per-face normals. */
export function facet(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  out.computeVertexNormals();
  return out;
}

/** Slightly darken a hex color (for gradient bottoms). */
export function shade(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return "#" + c.getHexString();
}
