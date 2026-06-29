import * as THREE from "three";

/**
 * Shared low-poly geometry primitives for the hand-built building generators
 * (mooring spire, landing stage, pumping station, observatory, incubator, sky-villa).
 *
 * Convention: every builder appends raw triangle soup into the shared `P` (positions,
 * flat xyz triples) and `I` (index) arrays. Faces are oriented outward from a supplied
 * reference centroid so callers never have to track winding by hand — `facet()` then
 * recomputes per-face normals for the faceted look. Build directly in hex-circumradius
 * units; the conform pass rescales the whole thing to the contract footprint.
 */

/** Push a triangle (a, b, c) oriented so its normal points away from (cx, cy, cz). */
export function outTri(
  P: number[], I: number[],
  a: number, b: number, c: number,
  cx: number, cy: number, cz: number,
): void {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
  const dx = P[c * 3], dy = P[c * 3 + 1], dz = P[c * 3 + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = dx - ax, vy = dy - ay, vz = dz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (ax + bx + dx) / 3 - cx, my = (ay + by + dy) / 3 - cy, mz = (az + bz + dz) / 3 - cz;
  if (nx * mx + ny * my + nz * mz < 0) I.push(a, c, b);
  else I.push(a, b, c);
}

export function outQuad(
  P: number[], I: number[],
  a: number, b: number, c: number, d: number,
  cx: number, cy: number, cz: number,
): void {
  outTri(P, I, a, b, c, cx, cy, cz);
  outTri(P, I, a, c, d, cx, cy, cz);
}

/** Append one vertex, return its index. */
function vert(P: number[], x: number, y: number, z: number): number {
  P.push(x, y, z);
  return P.length / 3 - 1;
}

/**
 * A capped cylinder/tube between points a and b. Faces orient outward from the axis
 * midpoint. `r` is the radius, `sides` the radial resolution, capA/capB add end disks.
 */
export function tube(
  P: number[], I: number[],
  a: [number, number, number], b: [number, number, number],
  r: number, sides: number, capA: boolean, capB: boolean,
): void {
  frustum(P, I, a, b, r, r, sides, capA, capB);
}

/**
 * A capped cone/frustum between points a and b with independent end radii (rA at a,
 * rB at b). Used for tapering shafts, spire fins, stepped tiers and finials.
 */
export function frustum(
  P: number[], I: number[],
  a: [number, number, number], b: [number, number, number],
  rA: number, rB: number, sides: number, capA: boolean, capB: boolean,
  rot = 0,
): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let px = uy, py = -ux, pz = 0;
  if (Math.hypot(px, py, pz) < 1e-4) { px = 1; py = 0; pz = 0; }
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2;
  const ringA: number[] = [], ringB: number[] = [];
  for (let s = 0; s < sides; s++) {
    const ang = (s / sides) * Math.PI * 2 + rot;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    ringA.push(vert(P, a[0] + (px * ca + qx * sa) * rA, a[1] + (py * ca + qy * sa) * rA, a[2] + (pz * ca + qz * sa) * rA));
    ringB.push(vert(P, b[0] + (px * ca + qx * sa) * rB, b[1] + (py * ca + qy * sa) * rB, b[2] + (pz * ca + qz * sa) * rB));
  }
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    outQuad(P, I, ringA[s], ringB[s], ringB[sn], ringA[sn], cx, cy, cz);
  }
  if (capA) for (let s = 1; s < sides - 1; s++) outTri(P, I, ringA[0], ringA[s], ringA[s + 1], cx, cy, cz);
  if (capB) for (let s = 1; s < sides - 1; s++) outTri(P, I, ringB[0], ringB[s], ringB[s + 1], cx, cy, cz);
}

/** A faceted hemisphere (dome) with its equator on `baseY`, centered at (cx, cz). */
export function dome(
  P: number[], I: number[],
  cx: number, cz: number, baseY: number, r: number, lat: number, lon: number,
): void {
  const rings: number[][] = [];
  for (let i = 0; i < lat; i++) {
    const phi = (i / lat) * (Math.PI / 2);
    const y = baseY + Math.sin(phi) * r;
    const rr = Math.cos(phi) * r;
    const row: number[] = [];
    for (let s = 0; s < lon; s++) {
      const ang = (s / lon) * Math.PI * 2;
      row.push(vert(P, cx + Math.cos(ang) * rr, y, cz + Math.sin(ang) * rr));
    }
    rings.push(row);
  }
  const apex = vert(P, cx, baseY + r, cz);
  for (let i = 0; i < lat - 1; i++) {
    for (let s = 0; s < lon; s++) {
      const sn = (s + 1) % lon;
      outQuad(P, I, rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s], cx, baseY, cz);
    }
  }
  const top = rings[lat - 1];
  for (let s = 0; s < lon; s++) outTri(P, I, top[s], top[(s + 1) % lon], apex, cx, baseY, cz);
}

/** An axis-aligned box spanning [x0,x1]·[y0,y1]·[z0,z1], faces outward. */
export function box(
  P: number[], I: number[],
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
): void {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const v = [
    vert(P, x0, y0, z0), vert(P, x1, y0, z0), vert(P, x1, y0, z1), vert(P, x0, y0, z1),
    vert(P, x0, y1, z0), vert(P, x1, y1, z0), vert(P, x1, y1, z1), vert(P, x0, y1, z1),
  ];
  outQuad(P, I, v[0], v[1], v[2], v[3], cx, cy, cz); // bottom
  outQuad(P, I, v[4], v[5], v[6], v[7], cx, cy, cz); // top
  outQuad(P, I, v[0], v[1], v[5], v[4], cx, cy, cz); // -z
  outQuad(P, I, v[2], v[3], v[7], v[6], cx, cy, cz); // +z
  outQuad(P, I, v[1], v[2], v[6], v[5], cx, cy, cz); // +x
  outQuad(P, I, v[3], v[0], v[4], v[7], cx, cy, cz); // -x
}

/** A torus ring in the XZ plane centered at (cx, cy, cz): major radius R, tube radius r. */
export function ring(
  P: number[], I: number[],
  cx: number, cy: number, cz: number,
  R: number, r: number, seg: number, sides: number,
): void {
  const rows: number[][] = [];
  const centers: [number, number, number][] = [];
  for (let i = 0; i < seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    const dirx = Math.cos(u), dirz = Math.sin(u);
    const ccx = cx + dirx * R, ccz = cz + dirz * R;
    centers.push([ccx, cy, ccz]);
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const v = (j / sides) * Math.PI * 2;
      const rr = Math.cos(v) * r;
      row.push(vert(P, ccx + dirx * rr, cy + Math.sin(v) * r, ccz + dirz * rr));
    }
    rows.push(row);
  }
  for (let i = 0; i < seg; i++) {
    const inext = (i + 1) % seg;
    // Reference = the tube's own cross-section center, so faces orient outward from the
    // tube surface (not the ring hub) — keeps the inner half of the torus from inverting.
    const mx = (centers[i][0] + centers[inext][0]) / 2;
    const my = (centers[i][1] + centers[inext][1]) / 2;
    const mz = (centers[i][2] + centers[inext][2]) / 2;
    for (let j = 0; j < sides; j++) {
      const jn = (j + 1) % sides;
      outQuad(P, I, rows[i][j], rows[inext][j], rows[inext][jn], rows[i][jn], mx, my, mz);
    }
  }
}

/**
 * A stepped art-deco cornice: a stack of thin overhanging square slabs centered at
 * (0, y, 0), each one tier narrower than the one above so it reads as a corbelled ledge.
 * `half` is the widest half-extent; `tiers` the step count; `thick` total vertical span.
 * Used by the ornamentation pass to crown shafts and ledges with 1930s detail.
 */
export function cornice(
  P: number[], I: number[],
  y: number, half: number, tiers: number, thick: number,
): void {
  const t = Math.max(1, tiers);
  const step = thick / t;
  for (let k = 0; k < t; k++) {
    const h = half * (1 - (k / t) * 0.35);
    const y0 = y + k * step;
    box(P, I, -h, h, y0, y0 + step, -h, h);
  }
}

/**
 * Vertical chevron ridges (art-deco fluting) running up a cylindrical shaft of radius
 * `rad` from y0 to y1: `count` thin triangular prisms standing proud of the surface by
 * `relief`. Scales cleanly with an ornamentation level (caller passes count/relief = 0
 * to skip). Centered on the Y axis.
 */
export function fluting(
  P: number[], I: number[],
  y0: number, y1: number, rad: number, relief: number, count: number, sides = 3,
): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const x = Math.cos(ang), z = Math.sin(ang);
    const a: [number, number, number] = [x * rad, y0, z * rad];
    const b: [number, number, number] = [x * rad, y1, z * rad];
    frustum(P, I, a, b, relief, relief, sides, false, false, ang);
  }
}

/**
 * Override the vertex color of every vertex whose centroid-position satisfies `where`,
 * blended toward `hex` by `amount` (1 = full replace). Run after applyVerticalGradient to
 * stamp localized accents — a glowing radium band, a brass instrument, a metal platform —
 * onto the baked height gradient. Predicate gets the per-vertex world position.
 */
export function paintWhere(
  geo: THREE.BufferGeometry,
  where: (x: number, y: number, z: number) => boolean,
  hex: string,
  amount = 1,
): void {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!col) return;
  const c = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i++) {
    if (!where(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    const r = col.getX(i) + (c.r - col.getX(i)) * amount;
    const g = col.getY(i) + (c.g - col.getY(i)) * amount;
    const b = col.getZ(i) + (c.b - col.getZ(i)) * amount;
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

/**
 * Recolor a contiguous run of triangles toward `hex`. `start`/`end` are positions in the
 * index array (i.e. record `I.length` before and after building a part). After `facet()`
 * runs `toNonIndexed()` in index order, output vertex k maps to index slot k, so an index
 * range is exactly the vertex range to repaint — the precise way to tint a built sub-part
 * (a metal platform, a brass barrel) regardless of where it sits in space.
 */
export function paintRange(
  geo: THREE.BufferGeometry,
  start: number, end: number, hex: string, amount = 1,
): void {
  const col = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!col) return;
  const c = new THREE.Color(hex);
  const hi = Math.min(end, col.count);
  for (let i = Math.max(0, start); i < hi; i++) {
    col.setXYZ(
      i,
      col.getX(i) + (c.r - col.getX(i)) * amount,
      col.getY(i) + (c.g - col.getY(i)) * amount,
      col.getZ(i) + (c.b - col.getZ(i)) * amount,
    );
  }
  col.needsUpdate = true;
}

/** Assemble a faceted BufferGeometry from accumulated positions/indices. */
export function buildGeometry(P: number[], I: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  return geo;
}
