import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.fighter;

const params = [
  { key: "cabin", label: "Cabin size", kind: "number", min: 0.2, max: 0.6, step: 0.02, default: 0.4 },
  { key: "prowLength", label: "Prow length", kind: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
  { key: "blades", label: "Propeller blades", kind: "int", min: 0, max: 8, step: 1, default: 5 },
  { key: "vanes", label: "Tail vanes", kind: "int", min: 0, max: 4, step: 1, default: 3 },
  { key: "hullColor", label: "Hull color", kind: "color", default: C.color },
  { key: "cabinColor", label: "Cabin color", kind: "color", default: "#B8893C" },
  { key: "flagColor", label: "Flag color", kind: "color", default: "#5A86C8" },
] as const;

// Build axis: +Z = bow (forward), -Z = stern. The conform pass scales the longest
// horizontal axis (the keel length) to the contract footprint, so build in natural units.
const HALF = 0.7;   // half the hull length along Z
const WMAX = 0.2;   // max hull half-width along X
const DECK = 0.26;  // nominal deck (gunwale) height

/** Hull cross-section parameters at station t (0 = stern, 1 = bow). */
function station(t: number): { z: number; w: number; deckY: number; keelY: number } {
  const z = -HALF + t * 2 * HALF;
  // Width: peaks just aft of midships, tapers to a point at the bow and a small transom aft.
  const w = WMAX * Math.max(0.04, 1 - Math.pow(Math.abs((t - 0.42) / 0.58), 1.6));
  // Sheer: deck rises toward the bow, with a slight lift at the stern.
  const deckY = DECK + 0.13 * Math.pow(t, 1.6) + 0.05 * Math.pow(1 - t, 2);
  // Rocker: keel is deepest amidships and rises toward both ends.
  const keelY = 0.02 + 0.11 * Math.pow(Math.abs(t - 0.5) * 2, 1.8);
  return { z, w, deckY, keelY };
}

/** One 6-point hull ring (right gunwale → keel → left gunwale; the 6→0 edge spans the deck). */
function ringAt(P: number[], t: number): { idx: number[]; cy: number; z: number } {
  const { z, w, deckY, keelY } = station(t);
  const midY = (deckY + keelY) / 2 + 0.02;
  const pts: [number, number][] = [
    [w, deckY], [0.85 * w, midY], [0.35 * w, keelY],
    [-0.35 * w, keelY], [-0.85 * w, midY], [-w, deckY],
  ];
  const idx = pts.map(([x, y]) => { P.push(x, y, z); return P.length / 3 - 1; });
  return { idx, cy: midY, z };
}

/**
 * One-man Flier: a slender airboat built like a Barsoomian scout flier. A lofted timber hull
 * with a raked bowsprit, a small brass cockpit cabin amidships, a stern mast flying a pennant,
 * fixed stabilizer wings, and a radial pusher propeller ringed by tail vanes at the stern.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const cabinSize = p.cabin as number;
  const prowLength = p.prowLength as number;
  const blades = Math.max(0, Math.round(p.blades as number));
  const vanes = Math.max(0, Math.round(p.vanes as number));
  const hullColor = p.hullColor as string;
  const cabinColor = p.cabinColor as string;
  const flagColor = p.flagColor as string;

  const P: number[] = [];
  const I: number[] = [];

  // --- Hull: loft 6-point rings from stern to bow. ---
  const STA = 12;
  const rings: { idx: number[]; cy: number; z: number }[] = [];
  for (let i = 0; i <= STA; i++) rings.push(ringAt(P, i / STA));
  for (let i = 0; i < STA; i++) {
    const a = rings[i], b = rings[i + 1];
    const refY = (a.cy + b.cy) / 2, refZ = (a.z + b.z) / 2;
    for (let j = 0; j < 6; j++) {
      const jn = (j + 1) % 6;
      outQuad(P, I, a.idx[j], a.idx[jn], b.idx[jn], b.idx[j], 0, refY, refZ);
    }
  }
  // Cap the stern transom (the bow ring is nearly a point, so it needs no real cap).
  const s = rings[0];
  for (let j = 1; j < 5; j++) outTri(P, I, s.idx[0], s.idx[j], s.idx[j + 1], 0, s.cy, s.z + 0.2);

  // --- Brass trim and fittings start here. ---
  const brassStart = I.length;

  // Prow spar: a plain raked bowsprit jutting up and forward off the bow. Zero length omits it.
  if (prowLength > 0) {
    const bow = station(1);
    const tip: [number, number, number] = [0, bow.deckY, bow.z];
    const end: [number, number, number] = [0, bow.deckY + 0.20 * prowLength, bow.z + 0.20 * prowLength];
    tube(P, I, tip, end, 0.020, 5, true, true);
  }

  // Cockpit cabin amidships: a low box with a slightly narrower raised roof.
  const cabinStart = I.length;
  {
    const t = 0.5;
    const st = station(t);
    const cy = st.deckY;
    const halfX = 0.13, halfZ = 0.10 + 0.22 * cabinSize;
    const bodyH = 0.10 + 0.14 * cabinSize;
    box(P, I, -halfX, halfX, cy, cy + bodyH, st.z - halfZ, st.z + halfZ);
    const rh = halfX * 0.7, rz = halfZ * 0.8;
    box(P, I, -rh, rh, cy + bodyH, cy + bodyH + 0.05, st.z - rz, st.z + rz); // roof
  }
  const cabinEnd = I.length;

  // Fixed stabilizer wings: a swept flat fin off each hull flank, just aft of midships.
  {
    const st = station(0.34);
    const cy = (st.deckY + st.keelY) / 2 + 0.03;
    for (const sgn of [-1, 1]) {
      const root: [number, number, number] = [sgn * st.w, cy, st.z];
      const tipP: [number, number, number] = [sgn * (st.w + 0.24), cy - 0.04, st.z - 0.12];
      frustum(P, I, root, tipP, 0.035, 0.012, 4, true, true);
    }
  }

  const brassEnd = I.length;

  // --- Mast + pennant. ---
  const mastStart = I.length;
  const mast = station(0.12);
  const mastBaseY = mast.deckY;
  const mastTopY = 0.72;
  tube(P, I, [0, mastBaseY, mast.z], [0, mastTopY, mast.z], 0.014, 5, false, true);
  const mastEnd = I.length;

  // Pennant: a thin triangular flag streaming aft from near the masthead.
  const flagStart = I.length;
  {
    const fy = mastTopY - 0.05, fz = mast.z;
    const a = mkVert(P, 0.005, fy + 0.05, fz);
    const b = mkVert(P, 0.005, fy - 0.05, fz);
    const c = mkVert(P, 0.005, fy - 0.005, fz - 0.18);
    outTri(P, I, a, b, c, 0.3, fy, fz); // +X face
    outTri(P, I, a, b, c, -0.3, fy, fz); // -X face (double-sided)
  }
  const flagEnd = I.length;

  // --- Pusher propeller + tail vanes at the stern. ---
  const metalStart = I.length;
  const propZ = station(0).z;
  const hubY = (station(0).deckY + station(0).keelY) / 2;
  // Hub: a short cylinder poking aft, tipped with a spinner cone.
  tube(P, I, [0, hubY, propZ], [0, hubY, propZ - 0.06], 0.045, 8, true, false);
  frustum(P, I, [0, hubY, propZ - 0.06], [0, hubY, propZ - 0.14], 0.045, 0.0, 8, false, false); // spinner
  // Blades: thin flat paddles radiating in the X-Y plane at the prop disc.
  for (let i = 0; i < blades; i++) {
    const ang = (i / Math.max(1, blades)) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rIn = 0.05, rOut = 0.17;
    const inner: [number, number, number] = [ca * rIn, hubY + sa * rIn, propZ - 0.04];
    const outer: [number, number, number] = [ca * rOut, hubY + sa * rOut, propZ - 0.04];
    frustum(P, I, inner, outer, 0.03, 0.012, 4, true, true, ang);
  }
  // Tail vanes: fixed fins radiating from the hull just forward of the disc (the cowl ribs).
  for (let i = 0; i < vanes; i++) {
    const ang = Math.PI / 2 + (i / Math.max(1, vanes)) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const r = 0.14;
    const root: [number, number, number] = [ca * 0.04, hubY + sa * 0.04, propZ + 0.04];
    const tipP: [number, number, number] = [ca * r, hubY + sa * r, propZ - 0.02];
    frustum(P, I, root, tipP, 0.03, 0.01, 4, true, true, ang);
  }
  const metalEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(hullColor, 0.6), shade(hullColor, 1.12)); // hull timber
  paintRange(geo, brassStart, brassEnd, "#B8893C", 0.9); // prow spar + wings: brass
  paintRange(geo, cabinStart, cabinEnd, cabinColor, 0.95); // cockpit cabin
  paintRange(geo, mastStart, mastEnd, "#7E8890", 0.85); // mast: pale metal
  paintRange(geo, flagStart, flagEnd, flagColor, 0.95); // pennant cloth
  paintRange(geo, metalStart, metalEnd, "#8A8F96", 0.9); // propeller + vanes: steel
  return { kind: "mesh", geometry: geo, color: hullColor };
}

/** Append one vertex, return its index. */
function mkVert(P: number[], x: number, y: number, z: number): number {
  P.push(x, y, z);
  return P.length / 3 - 1;
}

export const fighterDef: ArtifactDef = {
  type: "fighter",
  label: "Fighter",
  category: "ships",
  output: "mesh",
  contract: "fighter",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "fighter",
  promptSeed:
    "low-poly Barsoomian one-man scout flier, slender wooden airboat hull with a raked bowsprit, small brass cockpit cabin, stern mast with a pennant, swept stabilizer wings and a radial pusher propeller, retro-futuristic, matte, stylized game asset.",
};
