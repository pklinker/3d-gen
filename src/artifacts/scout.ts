import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.scout;

const params = [
  { key: "cabin", label: "Cabin size", kind: "number", min: 0.2, max: 0.6, step: 0.02, default: 0.4 },
  { key: "prow", label: "Prow curl", kind: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
  { key: "blades", label: "Propeller blades", kind: "int", min: 0, max: 8, step: 1, default: 4 },
  { key: "engineSpan", label: "Engine span", kind: "number", min: 0.16, max: 0.42, step: 0.02, default: 0.28 },
  { key: "hullColor", label: "Hull color", kind: "color", default: C.color },
  { key: "cabinColor", label: "Cabin color", kind: "color", default: "#B8893C" },
] as const;

// Build axis: +Z = bow (forward), -Z = stern. The conform pass scales the longest
// horizontal axis (the keel length) to the contract footprint, so build in natural units.
const HALF = 0.7;   // half the hull length along Z
const WMAX = 0.2;   // max hull half-width along X
const DECK = 0.26;  // nominal deck (gunwale) height

/** Hull cross-section parameters at station t (0 = stern, 1 = bow). Shares the fighter's boat hull. */
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
 * Scout: a fighter-style timber airboat — the same lofted boat hull with a scrolled prow and
 * a brass cockpit cabin — but propelled by two rear pusher engines slung on short stern
 * outriggers, each with its own propeller, plus a short mast flying a pennant.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const cabinSize = p.cabin as number;
  const prowCurl = p.prow as number;
  const blades = Math.max(0, Math.round(p.blades as number));
  const engineSpan = p.engineSpan as number;
  const hullColor = p.hullColor as string;
  const cabinColor = p.cabinColor as string;

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

  // --- Brass trim and fittings. ---
  const brassStart = I.length;

  // Scrolled prow: a spar sweeping up and forward off the bow, kinked into a curl.
  {
    const bow = station(1);
    const tip: [number, number, number] = [0, bow.deckY, bow.z];
    const k = prowCurl;
    const mid: [number, number, number] = [0, bow.deckY + 0.06 + 0.10 * k, bow.z + 0.08 + 0.06 * k];
    const end: [number, number, number] = [0, bow.deckY + 0.04 + 0.18 * k, bow.z + 0.02 + 0.02 * k];
    tube(P, I, tip, mid, 0.022, 5, true, false);
    tube(P, I, mid, end, 0.018, 5, false, true);
  }

  // Cockpit cabin amidships: a low box with a slightly narrower raised roof.
  const cabinStart = I.length;
  {
    const st = station(0.5);
    const cy = st.deckY;
    const halfX = 0.13, halfZ = 0.10 + 0.22 * cabinSize;
    const bodyH = 0.10 + 0.14 * cabinSize;
    box(P, I, -halfX, halfX, cy, cy + bodyH, st.z - halfZ, st.z + halfZ);
    const rh = halfX * 0.7, rz = halfZ * 0.8;
    box(P, I, -rh, rh, cy + bodyH, cy + bodyH + 0.05, st.z - rz, st.z + rz); // roof
  }
  const cabinEnd = I.length;

  // Stern outriggers: a short pylon from each hull flank out to an engine nacelle.
  const engStation = station(0.18);
  const engY = (engStation.deckY + engStation.keelY) / 2 + 0.02;
  const engZ = engStation.z;
  for (const sgn of [-1, 1]) {
    const root: [number, number, number] = [sgn * engStation.w, engY, engZ + 0.02];
    const nac: [number, number, number] = [sgn * engineSpan, engY, engZ];
    frustum(P, I, root, nac, 0.04, 0.05, 4, true, false);
  }
  const brassEnd = I.length;

  // --- Mast + pennant amidships, just forward of the engines. ---
  const mastStart = I.length;
  const mast = station(0.36);
  const mastTopY = 0.6;
  tube(P, I, [0, mast.deckY, mast.z], [0, mastTopY, mast.z], 0.014, 5, false, true);
  const mastEnd = I.length;

  const flagStart = I.length;
  {
    const fy = mastTopY - 0.05, fz = mast.z;
    const a = mkVert(P, 0.005, fy + 0.05, fz);
    const b = mkVert(P, 0.005, fy - 0.05, fz);
    const c = mkVert(P, 0.005, fy - 0.005, fz - 0.18);
    outTri(P, I, a, b, c, 0.3, fy, fz);
    outTri(P, I, a, b, c, -0.3, fy, fz); // double-sided
  }
  const flagEnd = I.length;

  // --- Twin rear engines: nacelle + spinner + pusher propeller on each stern outrigger. ---
  const metalStart = I.length;
  const nl = 0.18; // nacelle length along Z
  for (const sgn of [-1, 1]) {
    const ex = sgn * engineSpan;
    const frontZ = engZ + nl * 0.45, backZ = engZ - nl * 0.55;
    tube(P, I, [ex, engY, frontZ], [ex, engY, backZ], 0.05, 8, true, false);
    frustum(P, I, [ex, engY, backZ], [ex, engY, backZ - 0.05], 0.05, 0, 8, false, false); // tail fairing
    // Pusher propeller in the X-Y disc just aft of the nacelle.
    const discZ = backZ - 0.03;
    for (let i = 0; i < blades; i++) {
      const ang = (i / Math.max(1, blades)) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rIn = 0.045, rOut = 0.15;
      const inner: [number, number, number] = [ex + ca * rIn, engY + sa * rIn, discZ];
      const outer: [number, number, number] = [ex + ca * rOut, engY + sa * rOut, discZ];
      frustum(P, I, inner, outer, 0.026, 0.01, 4, true, true, ang);
    }
  }
  const metalEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(hullColor, 0.6), shade(hullColor, 1.12)); // hull timber
  paintRange(geo, brassStart, brassEnd, "#B8893C", 0.9); // prow + outriggers: brass
  paintRange(geo, cabinStart, cabinEnd, cabinColor, 0.95); // cockpit cabin
  paintRange(geo, mastStart, mastEnd, "#7E8890", 0.85); // mast: pale metal
  paintRange(geo, flagStart, flagEnd, "#5A86C8", 0.95); // pennant: blue cloth
  paintRange(geo, metalStart, metalEnd, "#8A8F96", 0.9); // nacelles + propellers: steel
  return { kind: "mesh", geometry: geo, color: hullColor };
}

/** Append one vertex, return its index. */
function mkVert(P: number[], x: number, y: number, z: number): number {
  P.push(x, y, z);
  return P.length / 3 - 1;
}

export const scoutDef: ArtifactDef = {
  type: "scout",
  label: "Scout",
  category: "ships",
  output: "mesh",
  contract: "scout",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "scout",
  promptSeed:
    "low-poly Barsoomian scout flier, wooden airboat hull with a scrolled prow and brass cockpit cabin, twin rear pusher propeller engines on stern outriggers and a short mast with a pennant, retro-futuristic, matte, stylized game asset.",
};
