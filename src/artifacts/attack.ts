import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.attack;

const params = [
  { key: "canopy", label: "Canopy size", kind: "number", min: 0.2, max: 0.6, step: 0.02, default: 0.35 },
  { key: "span", label: "Engine span", kind: "number", min: 0.3, max: 0.7, step: 0.02, default: 0.5 },
  { key: "blades", label: "Propeller blades", kind: "int", min: 0, max: 6, step: 1, default: 4 },
  { key: "gun", label: "Gun barrel length", kind: "number", min: 0.1, max: 0.4, step: 0.02, default: 0.25 },
  { key: "hullColor", label: "Hull color", kind: "color", default: C.color },
  { key: "cabinColor", label: "Cabin color", kind: "color", default: "#5A86C8" },
] as const;

// Build axis: +Z = bow (forward), -Z = stern. The conform pass scales the longest
// horizontal axis (the fuselage length) to the contract footprint, so build in natural units.
const HALF = 0.7;   // half the fuselage length along Z
const WMAX = 0.16;  // max fuselage half-width along X
const HMAX = 0.13;  // max fuselage half-height along Y
const CY = 0.22;    // fuselage axis height

/** Append one vertex, return its index. */
function vert(P: number[], x: number, y: number, z: number): number {
  P.push(x, y, z);
  return P.length / 3 - 1;
}

/** Hull fullness at station t (0 = stern tip, 1 = bow tip); a spindle that points at both ends. */
function profileR(t: number): number {
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7);
}

/** Local hull top (Y) at world z, so deck fittings seat on the tapered surface instead of
 *  floating at the fuselage's max height. */
function hullTopAt(z: number): number {
  const t = (z + HALF) / (2 * HALF);
  return CY + HMAX * profileR(t);
}

/**
 * Twin-engine Attack ship: a fast, streamlined one-man flier. A spindle wooden fuselage with
 * a raised glass canopy, a forward-firing nose cannon, two wing-mounted tractor engines on
 * short stub pylons, and a twin-finned tail.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const canopySize = p.canopy as number;
  const span = p.span as number;
  const blades = Math.max(0, Math.round(p.blades as number));
  const gunLen = p.gun as number;
  const hullColor = p.hullColor as string;
  const cabinColor = p.cabinColor as string;

  const P: number[] = [];
  const I: number[] = [];

  // --- Fuselage: loft octagonal rings into a spindle, capped with nose/tail apex fans. ---
  const N = 8;
  const STA = 12;
  const rings: number[][] = [];
  const ringZ: number[] = [];
  for (let i = 1; i < STA; i++) {
    const t = i / STA;
    const pr = profileR(t);
    const rx = WMAX * pr, ry = HMAX * pr;
    const z = -HALF + t * 2 * HALF;
    const row: number[] = [];
    for (let s = 0; s < N; s++) {
      const a = (s / N) * Math.PI * 2;
      row.push(vert(P, Math.cos(a) * rx, CY + Math.sin(a) * ry, z));
    }
    rings.push(row);
    ringZ.push(z);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1];
    const midZ = (ringZ[k] + ringZ[k + 1]) / 2;
    for (let s = 0; s < N; s++) {
      const sn = (s + 1) % N;
      outQuad(P, I, a[s], a[sn], b[sn], b[s], 0, CY, midZ);
    }
  }
  // Nose + tail apex caps.
  const nose = vert(P, 0, CY, HALF);
  const lastRing = rings[rings.length - 1];
  for (let s = 0; s < N; s++) outTri(P, I, nose, lastRing[s], lastRing[(s + 1) % N], 0, CY, HALF - 0.25);
  const tail = vert(P, 0, CY, -HALF);
  const firstRing = rings[0];
  for (let s = 0; s < N; s++) outTri(P, I, tail, firstRing[(s + 1) % N], firstRing[s], 0, CY, -HALF + 0.25);

  // --- Canopy: a raised glass bubble forward of midships. ---
  const glassStart = I.length;
  {
    const cz = 0.05;
    const hx = 0.07, hz = 0.09 + 0.14 * canopySize, h = 0.07 + 0.06 * canopySize;
    // Seat the canopy on the local hull top at its forward (lowest) edge, embedded slightly
    // so it emerges from the deck rather than hovering above the tapered hull.
    const top = hullTopAt(cz + hz) - 0.03;
    // Canopy: a glass box with a lower narrower roof rail.
    box(P, I, -hx, hx, top, top + h, cz - hz, cz + hz);
    box(P, I, -hx * 0.7, hx * 0.7, top + h, top + h + 0.03, cz - hz * 0.6, cz + hz * 0.4); // roof rail
  }
  const glassEnd = I.length;

  // --- Nose cannon: a steel barrel firing forward from the bow, with a muzzle ring. ---
  const gunStart = I.length;
  {
    const z0 = HALF - 0.18, z1 = HALF + gunLen;
    box(P, I, -0.045, 0.045, CY - 0.04, CY + 0.04, z0, HALF - 0.02); // breech mount
    tube(P, I, [0, CY, z0 + 0.06], [0, CY, z1], 0.026, 6, true, true); // barrel
    tube(P, I, [0, CY, z1 - 0.03], [0, CY, z1 + 0.015], 0.034, 6, false, true); // muzzle
  }
  const gunEnd = I.length;

  // --- Twin engines: stub pylon + nacelle + spinner on each side. ---
  const engineStart = I.length;
  const ez = -0.02;             // engine station along Z (just aft of midships)
  const ey = CY;                // on the fuselage axis line
  const nacR = 0.06, nl = 0.3;  // nacelle radius + length
  const backZ = ez - nl * 0.55, frontZ = ez + nl * 0.45;
  const fuseSide = WMAX * profileR((ez + HALF) / (2 * HALF));
  for (const sgn of [-1, 1]) {
    const ex = sgn * span;
    // Stub pylon from the fuselage flank out to the nacelle.
    frustum(P, I, [sgn * fuseSide, ey, ez], [ex, ey, ez], 0.05, nacR * 0.7, 4, true, false);
    // Nacelle body + spinner cone facing forward.
    tube(P, I, [ex, ey, backZ], [ex, ey, frontZ], nacR, 8, true, false);
    frustum(P, I, [ex, ey, frontZ], [ex, ey, frontZ + 0.06], nacR, 0, 8, false, false);
  }
  const engineEnd = I.length;

  // --- Propellers: blades on each spinner, in the X-Y disc at the nacelle front. ---
  const propStart = I.length;
  for (const sgn of [-1, 1]) {
    const ex = sgn * span;
    const discZ = frontZ + 0.03;
    for (let i = 0; i < blades; i++) {
      const ang = (i / Math.max(1, blades)) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rIn = 0.05, rOut = 0.15;
      const inner: [number, number, number] = [ex + ca * rIn, ey + sa * rIn, discZ];
      const outer: [number, number, number] = [ex + ca * rOut, ey + sa * rOut, discZ];
      frustum(P, I, inner, outer, 0.026, 0.01, 4, true, true, ang);
    }
  }
  const propEnd = I.length;

  // --- Twin tail fins: two vertical stabilizers + a horizontal tailplane at the stern. ---
  const finStart = I.length;
  {
    const tz = -HALF * 0.78;
    const top = hullTopAt(tz) - 0.02; // seat fins on the tapered tail, embedded slightly
    for (const sgn of [-1, 1]) {
      const root: [number, number, number] = [sgn * 0.03, top, tz];
      const tipP: [number, number, number] = [sgn * 0.14, top + 0.2, tz - 0.06];
      frustum(P, I, root, tipP, 0.03, 0.012, 4, true, true);
    }
    // Horizontal tailplane.
    box(P, I, -0.22, 0.22, CY - 0.01, CY + 0.01, tz - 0.05, tz + 0.05);
  }
  const finEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(hullColor, 0.6), shade(hullColor, 1.12)); // fuselage timber
  paintRange(geo, glassStart, glassEnd, cabinColor, 0.9); // canopy (cabin)
  paintRange(geo, gunStart, gunEnd, "#8A8F96", 0.9); // cannon: steel
  paintRange(geo, engineStart, engineEnd, "#B8893C", 0.9); // pylons + nacelles: brass
  paintRange(geo, propStart, propEnd, "#8A8F96", 0.9); // propellers: steel
  paintRange(geo, finStart, finEnd, "#B8893C", 0.85); // tail fins: brass trim
  return { kind: "mesh", geometry: geo, color: hullColor };
}

export const attackDef: ArtifactDef = {
  type: "attack",
  label: "Attack ship",
  category: "ships",
  output: "mesh",
  contract: "attack",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "attack",
  promptSeed:
    "low-poly Barsoomian twin-engine attack flier, streamlined wooden fuselage with a glass canopy, a forward-firing nose cannon, two wing-mounted tractor propeller engines and a twin-finned tail, retro-futuristic, matte, stylized game asset.",
};
