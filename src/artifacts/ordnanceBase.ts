import { outTri, outQuad } from "../generation/primitives";

/**
 * Shared base for the ordnance class (Missile, Bomb, Torpedo): horizontally oriented bodies
 * of revolution along local Z (+Z = nose/front, -Z = tail, matching the ships' "+Z = bow"
 * convention), built from a simple radius-per-z profile, plus swept fins radiating around the
 * Z axis near the tail.
 */

export interface ProfilePoint {
  z: number;
  /** Radius at this z. A value below ~0.001 caps the body with a point (nose/tail tip)
   *  instead of a flat disk. */
  r: number;
}

/**
 * Loft a body of revolution along Z from an ordered (tail -> nose) profile of {z, r} points.
 * Profile points with r ~ 0 become a single apex vertex (a sharp tip) instead of a degenerate
 * ring; ends with r > 0 get a flat polygon cap. Appends to P/I.
 */
export function buildBodyOfRevolution(
  P: number[], I: number[],
  profile: ProfilePoint[],
  sides: number,
): void {
  const EPS = 0.001;
  const rings: (number[] | number)[] = [];
  for (const { z, r } of profile) {
    if (r < EPS) {
      P.push(0, 0, z);
      rings.push(P.length / 3 - 1);
    } else {
      const ring: number[] = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        P.push(Math.cos(a) * r, Math.sin(a) * r, z);
        ring.push(P.length / 3 - 1);
      }
      rings.push(ring);
    }
  }

  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1];
    const refZ = (profile[k].z + profile[k + 1].z) / 2;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let s = 0; s < sides; s++) {
        const sn = (s + 1) % sides;
        outQuad(P, I, a[s], a[sn], b[sn], b[s], 0, 0, refZ);
      }
    } else if (Array.isArray(a) && !Array.isArray(b)) {
      for (let s = 0; s < sides; s++) {
        const sn = (s + 1) % sides;
        outTri(P, I, a[s], a[sn], b, 0, 0, refZ); // fan to nose apex
      }
    } else if (!Array.isArray(a) && Array.isArray(b)) {
      for (let s = 0; s < sides; s++) {
        const sn = (s + 1) % sides;
        outTri(P, I, a, b[sn], b[s], 0, 0, refZ); // fan from tail apex
      }
    }
    // Both points (degenerate zero-length segment) — nothing to build.
  }

  const firstRing = rings[0];
  if (Array.isArray(firstRing)) {
    for (let s = 1; s < sides - 1; s++) {
      outTri(P, I, firstRing[0], firstRing[s], firstRing[s + 1], 0, 0, profile[0].z + 0.1);
    }
  }
  const lastRing = rings[rings.length - 1];
  if (Array.isArray(lastRing)) {
    for (let s = 1; s < sides - 1; s++) {
      outTri(P, I, lastRing[0], lastRing[s], lastRing[s + 1], 0, 0, profile[profile.length - 1].z - 0.1);
    }
  }
}

/**
 * A swept fin radiating outward in the XY plane at angle `ang` (0 = +X) around the Z axis,
 * spanning from `zRoot` to `zTip` along the body. `rInner` is the body-surface radius it
 * mounts at; `rOuterRoot`/`rOuterTip` let the outer edge sweep (e.g. wider at the trailing
 * edge for a swept-back look). `thickness` is the fin's own thinness.
 */
export function buildTailFin(
  P: number[], I: number[],
  ang: number, zRoot: number, zTip: number,
  rInner: number, rOuterRoot: number, rOuterTip: number,
  thickness: number,
): void {
  const dx = Math.cos(ang), dy = Math.sin(ang); // radial direction
  const tx = -dy, ty = dx; // tangential (fin thickness direction)
  const corner = (r: number, z: number, s: number): number => {
    P.push(dx * r + tx * (thickness / 2) * s, dy * r + ty * (thickness / 2) * s, z);
    return P.length / 3 - 1;
  };
  const ri0 = corner(rInner, zRoot, -1), ri1 = corner(rInner, zRoot, 1);
  const ro0 = corner(rOuterRoot, zRoot, -1), ro1 = corner(rOuterRoot, zRoot, 1);
  const ti0 = corner(rInner, zTip, -1), ti1 = corner(rInner, zTip, 1);
  const to0 = corner(rOuterTip, zTip, -1), to1 = corner(rOuterTip, zTip, 1);
  const cx = dx * (rInner + rOuterRoot) / 2, cy = dy * (rInner + rOuterRoot) / 2, cz = (zRoot + zTip) / 2;
  outQuad(P, I, ro0, ro1, to1, to0, cx, cy, cz); // outer edge
  outQuad(P, I, ri0, ti0, ti1, ri1, cx, cy, cz); // inner (against the body)
  outQuad(P, I, ro0, to0, ti0, ri0, cx, cy, cz); // side -
  outQuad(P, I, ro1, ri1, ti1, to1, cx, cy, cz); // side +
  outQuad(P, I, ro0, ri0, ri1, ro1, cx, cy, cz); // root-end cap
  outQuad(P, I, to0, to1, ti1, ti0, cx, cy, cz); // tip-end cap
}
