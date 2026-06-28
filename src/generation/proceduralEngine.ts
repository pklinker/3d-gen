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

export type FootprintShape = "square" | "hex";

/** Build the square-grid top surface; returns the clockwise (from above) perimeter loop. */
function squareTop(
  positions: number[],
  indices: number[],
  n: number,
  half: number,
  h: (x: number, z: number) => number,
): number[] {
  const coord = (k: number) => -half + (k / (n - 1)) * 2 * half;
  const idx = (i: number, j: number) => i * n + j;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = coord(i);
      const z = coord(j);
      positions.push(x, Math.max(0, h(x, z)), z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = idx(i, j), c = idx(i + 1, j + 1), d = idx(i, j + 1), b = idx(i + 1, j);
      indices.push(a, d, c, a, c, b);
    }
  }
  const loop: number[] = [];
  for (let j = 0; j < n; j++) loop.push(idx(0, j));
  for (let i = 1; i < n; i++) loop.push(idx(i, n - 1));
  for (let j = n - 2; j >= 0; j--) loop.push(idx(n - 1, j));
  for (let i = n - 2; i >= 1; i--) loop.push(idx(i, 0));
  return loop;
}

/**
 * Build a pointy-top hexagonal top surface as concentric polar rings whose outermost ring
 * sits exactly on the hex edges (matching the viewport's circumradius-1 hex footprint).
 * Resolution is derived from `n` so detail is comparable to the square grid. Returns the
 * clockwise (from above) perimeter loop.
 */
function hexTop(
  positions: number[],
  indices: number[],
  n: number,
  half: number,
  h: (x: number, z: number) => number,
): number[] {
  const edgeSeg = Math.max(2, Math.round(n / 5));
  const A = 6 * edgeSeg; // angular samples land on the 6 corners
  const rings = Math.max(6, Math.round(n * 0.62));
  const apothem = half * Math.cos(Math.PI / 6);
  const phi0 = Math.PI / 6; // pointy-top: vertices at 30°, 90°, …
  // Distance from center to the hex edge at angle theta.
  const hexR = (theta: number) => {
    const a = (((theta - phi0) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
    return apothem / Math.cos(a - Math.PI / 6);
  };

  positions.push(0, Math.max(0, h(0, 0)), 0);
  const center = 0;
  const ring: number[][] = [];
  for (let r = 1; r <= rings; r++) {
    const tr = r / rings;
    const row: number[] = [];
    for (let a = 0; a < A; a++) {
      const theta = (a / A) * Math.PI * 2;
      const rad = hexR(theta) * tr;
      const x = Math.cos(theta) * rad;
      const z = Math.sin(theta) * rad;
      positions.push(x, Math.max(0, h(x, z)), z);
      row.push(positions.length / 3 - 1);
    }
    ring.push(row);
  }

  // Center fan to ring 1 (normals up).
  const r1 = ring[0];
  for (let a = 0; a < A; a++) indices.push(center, r1[(a + 1) % A], r1[a]);
  // Concentric ring quads (normals up).
  for (let r = 0; r < rings - 1; r++) {
    const inn = ring[r], out = ring[r + 1];
    for (let a = 0; a < A; a++) {
      const an = (a + 1) % A;
      indices.push(inn[a], out[an], out[a], inn[a], inn[an], out[an]);
    }
  }
  // Outer ring runs CCW with theta; reverse for a clockwise wall loop like squareTop.
  return ring[rings - 1].slice().reverse();
}

/**
 * Build a closed solid from a height function over a square or hexagonal footprint: a
 * subdivided top surface (y = h(x, z), clamped to >= 0), vertical side walls dropping to
 * Y = 0, and a flat bottom — watertight with its base flush on Y = 0. Returns an indexed
 * geometry; the caller should facet() and apply vertex colors.
 *
 *  n     grid resolution (vertices per side; hex resolution is derived from it)
 *  half  half-extent in X and Z (footprint / 2; hex circumradius)
 *  h     height at world (x, z)
 *  shape "square" (default) or "hex"
 */
export function heightfieldSolid(
  n: number,
  half: number,
  h: (x: number, z: number) => number,
  shape: FootprintShape = "square",
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const loop =
    shape === "hex"
      ? hexTop(positions, indices, n, half, h)
      : squareTop(positions, indices, n, half, h);

  // Mirror each loop vertex onto Y = 0 for the wall foot.
  const bottom: number[] = [];
  for (const li of loop) {
    positions.push(positions[li * 3], 0, positions[li * 3 + 2]);
    bottom.push(positions.length / 3 - 1);
  }

  // Side walls (outward-facing) between the top loop and its Y=0 foot.
  for (let k = 0; k < loop.length; k++) {
    const kn = (k + 1) % loop.length;
    const tA = loop[k], tB = loop[kn], bA = bottom[k], bB = bottom[kn];
    indices.push(tA, bA, bB, tA, bB, tB);
  }

  // Flat bottom cap at Y = 0 (normals down): fan over the foot loop centroid.
  let cx = 0, cz = 0;
  for (const bi of bottom) { cx += positions[bi * 3]; cz += positions[bi * 3 + 2]; }
  cx /= bottom.length; cz /= bottom.length;
  const cen = positions.length / 3;
  positions.push(cx, 0, cz);
  for (let k = 0; k < bottom.length; k++) {
    const kn = (k + 1) % bottom.length;
    indices.push(cen, bottom[kn], bottom[k]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
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
