import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, dome, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.lightCruiser;

const params = [
  { key: "cabin",      label: "Cabin size",       kind: "number", min: 0.3, max: 0.7, step: 0.02, default: 0.5 },
  { key: "prowLength", label: "Prow length",      kind: "number", min: 0,   max: 1,  step: 0.05, default: 0.6 },
  { key: "blades",     label: "Propeller blades",  kind: "int",    min: 0,   max: 8,  step: 1,    default: 4 },
  { key: "engineSpan", label: "Engine span",        kind: "number", min: 0.2, max: 0.5, step: 0.02, default: 0.34 },
  { key: "hullColor",  label: "Hull color",         kind: "color",  default: C.color },
  { key: "cabinColor", label: "Cabin color",         kind: "color",  default: "#9A8C70" },
  { key: "flagColor",  label: "Flag color",           kind: "color",  default: "#5A86C8" },
] as const;

// Build axis: +Z = bow (forward), -Z = stern.
const HALF = 0.78;   // half the keel length along Z — wider / longer than scout
const WMAX = 0.30;   // max hull half-width (cruiser is notably beamier)
const DECK = 0.28;   // gunwale height at widest point

/** Hull cross-section at station t (0 = stern, 1 = bow). */
function station(t: number): { z: number; w: number; deckY: number; keelY: number } {
  const z = -HALF + t * 2 * HALF;
  // Wider beam peaks at 45 % of the waterline, tapers to points at both ends.
  const w = WMAX * Math.max(0.05, 1 - Math.pow(Math.abs((t - 0.45) / 0.55), 1.5));
  // Sheer: bow rises more steeply than a small flier, slight lift at the stern.
  const deckY = DECK + 0.14 * Math.pow(t, 1.5) + 0.04 * Math.pow(1 - t, 2);
  // Rocker: keel sags amidships.
  const keelY = 0.02 + 0.10 * Math.pow(Math.abs(t - 0.5) * 2, 1.8);
  return { z, w, deckY, keelY };
}

/** Deck height at world z (for seating deck fittings on the tapered hull). */
function deckAt(z: number): number {
  const t = (z + HALF) / (2 * HALF);
  const s = station(Math.min(1, Math.max(0, t)));
  return s.deckY;
}

/** One 8-point hull ring (wider polygon to give the cruiser a fuller, rounder cross-section). */
function ringAt(P: number[], t: number): { idx: number[]; cy: number; z: number } {
  const { z, w, deckY, keelY } = station(t);
  const cy = (deckY + keelY) / 2 + 0.02;
  const pts: [number, number][] = [
    [w,          deckY],
    [w * 0.78,   cy + (deckY - cy) * 0.45],
    [w * 0.42,   cy],
    [w * 0.20,   keelY],
    [-w * 0.20,  keelY],
    [-w * 0.42,  cy],
    [-w * 0.78,  cy + (deckY - cy) * 0.45],
    [-w,         deckY],
  ];
  const idx = pts.map(([x, y]) => { P.push(x, y, z); return P.length / 3 - 1; });
  return { idx, cy, z };
}

/**
 * Light Cruiser: a broad timber airboat hull with a raked bow prow spar, a two-tier
 * superstructure cabin amidships, a forward gun turret (twin-barrelled) sitting on the deck
 * just in front of the cabin, and two rear pusher engines on stern outriggers.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const cabinSize  = p.cabin      as number;
  const prowLength = p.prowLength as number;
  const blades     = Math.max(0, Math.round(p.blades as number));
  const engineSpan = p.engineSpan as number;
  const hullColor  = p.hullColor  as string;
  const cabinColor = p.cabinColor as string;
  const flagColor  = p.flagColor  as string;

  const P: number[] = [];
  const I: number[] = [];

  // ── Hull loft ────────────────────────────────────────────────────────────────
  const STA = 14;
  const rings: { idx: number[]; cy: number; z: number }[] = [];
  for (let i = 0; i <= STA; i++) rings.push(ringAt(P, i / STA));

  const N = 8; // points per ring
  for (let i = 0; i < STA; i++) {
    const a = rings[i], b = rings[i + 1];
    const refY = (a.cy + b.cy) / 2, refZ = (a.z + b.z) / 2;
    for (let j = 0; j < N; j++) {
      const jn = (j + 1) % N;
      outQuad(P, I, a.idx[j], a.idx[jn], b.idx[jn], b.idx[j], 0, refY, refZ);
    }
  }
  // Stern transom cap.
  const sternRing = rings[0];
  for (let j = 1; j < N - 1; j++)
    outTri(P, I, sternRing.idx[0], sternRing.idx[j], sternRing.idx[j + 1], 0, sternRing.cy, sternRing.z + 0.2);

  // ── Bow prow spar ────────────────────────────────────────────────────────────
  const brassStart = I.length;
  if (prowLength > 0) {
    const bow = station(1);
    const tip: [number, number, number] = [0, bow.deckY, bow.z];
    const end: [number, number, number] = [0, bow.deckY + 0.22 * prowLength, bow.z + 0.22 * prowLength];
    tube(P, I, tip, end, 0.025, 6, true, true);
  }

  // ── Stern outrigger pylons (brass) ───────────────────────────────────────────
  const engSt = station(0.20);
  const engY  = (engSt.deckY + engSt.keelY) / 2 + 0.02;
  const engZ  = engSt.z;
  for (const sgn of [-1, 1]) {
    const root: [number, number, number] = [sgn * engSt.w * 0.85, engY, engZ];
    const tip:  [number, number, number] = [sgn * engineSpan,      engY, engZ];
    frustum(P, I, root, tip, 0.045, 0.055, 5, true, false);
  }
  const brassEnd = I.length;

  // ── Cabin / superstructure (two tiers) ──────────────────────────────────────
  const cabinStart = I.length;
  {
    // Station ~0.50 = midships
    const st   = station(0.50);
    const base = deckAt(st.z) - 0.01; // seat on deck, embed 1 cm
    const hw   = 0.16 + 0.06 * cabinSize;   // half-width
    const hz   = 0.13 + 0.14 * cabinSize;   // half-length
    const h1   = 0.10 + 0.08 * cabinSize;   // lower deck-house height
    const h2   = 0.07 + 0.04 * cabinSize;   // upper bridge height
    // Lower deck-house.
    box(P, I, -hw, hw, base, base + h1, st.z - hz, st.z + hz);
    // Narrower upper bridge.
    const bw = hw * 0.7, bz = hz * 0.75;
    box(P, I, -bw, bw, base + h1, base + h1 + h2, st.z - bz, st.z + bz);
    // Thin roof cap.
    box(P, I, -bw * 0.85, bw * 0.85, base + h1 + h2, base + h1 + h2 + 0.025, st.z - bz * 0.85, st.z + bz * 0.85);
  }
  const cabinEnd = I.length;

  // ── Forward gun turret ───────────────────────────────────────────────────────
  // Placed forward of the cabin at station ~0.70 (closer to the bow).
  const turretStart = I.length;
  {
    const tz     = station(0.70).z;          // Z position of turret centre
    const tBase  = deckAt(tz) - 0.01;        // seat on deck
    const tR     = 0.10;                     // turret base radius
    const tBodyH = 0.07;                     // rotating body height
    const tBodyR = 0.082;

    // Flat octagonal base ring.
    frustum(P, I, [0, tBase, tz], [0, tBase + 0.035, tz], tR, tR * 0.90, 8, true, false);
    // Turret body.
    frustum(P, I, [0, tBase + 0.035, tz], [0, tBase + 0.035 + tBodyH, tz], tR * 0.90, tBodyR * 0.75, 8, false, false);
    // Domed roof.
    dome(P, I, 0, tz, tBase + 0.035 + tBodyH, tBodyR * 0.75, 2, 8);

    // Twin barrels: side by side, extending toward the bow (+Z).
    const barrelY = tBase + 0.035 + tBodyH * 0.55;
    const barrelZ0 = tz + 0.01;
    const barrelZ1 = tz + 0.26;
    for (const sgn of [-1, 1]) {
      const bx = sgn * 0.025;
      tube(P, I, [bx, barrelY, barrelZ0], [bx, barrelY, barrelZ1], 0.018, 6, true, false);
      // Muzzle collar.
      tube(P, I, [bx, barrelY, barrelZ1 - 0.025], [bx, barrelY, barrelZ1 + 0.012], 0.024, 6, false, true);
    }
  }
  const turretEnd = I.length;

  // ── Mast + pennant ───────────────────────────────────────────────────────────
  const mastStart = I.length;
  const mastSt  = station(0.36);
  const mastTopY = 0.82;
  tube(P, I, [0, mastSt.deckY, mastSt.z], [0, mastTopY, mastSt.z], 0.016, 5, false, true);
  // Cross yard.
  tube(P, I, [-0.10, mastTopY - 0.12, mastSt.z], [0.10, mastTopY - 0.12, mastSt.z], 0.010, 4, true, true);
  const mastEnd = I.length;

  const flagStart = I.length;
  {
    const fy = mastTopY - 0.05, fz = mastSt.z;
    const v = (x: number, y: number, z: number) => { P.push(x, y, z); return P.length / 3 - 1; };
    const a = v(0.006, fy + 0.06, fz), b = v(0.006, fy - 0.06, fz), c = v(0.006, fy - 0.006, fz - 0.22);
    outTri(P, I, a, b, c,  0.4, fy, fz);
    outTri(P, I, a, b, c, -0.4, fy, fz);
  }
  const flagEnd = I.length;

  // ── Twin rear pusher engines ─────────────────────────────────────────────────
  const metalStart = I.length;
  const nl = 0.22;  // nacelle length (longer than scout to match cruiser scale)
  const nr = 0.068; // nacelle radius
  const frontZ = engZ + nl * 0.45, backZ = engZ - nl * 0.55;
  for (const sgn of [-1, 1]) {
    const ex = sgn * engineSpan;
    tube(P, I,    [ex, engY, frontZ], [ex, engY, backZ], nr, 8, true, false);
    frustum(P, I, [ex, engY, backZ],  [ex, engY, backZ - 0.06], nr, 0, 8, false, false);
    // Pusher propeller blades in the X-Y disc just aft of the nacelle.
    const discZ = backZ - 0.035;
    for (let i = 0; i < blades; i++) {
      const ang = (i / Math.max(1, blades)) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rIn = 0.05, rOut = 0.17;
      const inner: [number, number, number] = [ex + ca * rIn, engY + sa * rIn, discZ];
      const outer: [number, number, number] = [ex + ca * rOut, engY + sa * rOut, discZ];
      frustum(P, I, inner, outer, 0.028, 0.011, 4, true, true, ang);
    }
  }
  const metalEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(hullColor, 0.55), shade(hullColor, 1.15));
  paintRange(geo, brassStart,  brassEnd,  "#B8893C", 0.90); // prow + outrigger pylons: brass
  paintRange(geo, cabinStart,  cabinEnd,  cabinColor, 0.95); // superstructure
  paintRange(geo, turretStart, turretEnd, "#8A8F96", 0.90); // gun turret: steel
  paintRange(geo, mastStart,   mastEnd,   "#7E8890", 0.85); // mast: pale metal
  paintRange(geo, flagStart,   flagEnd,   flagColor, 0.95); // pennant cloth
  paintRange(geo, metalStart,  metalEnd,  "#8A8F96", 0.90); // nacelles + propellers: steel
  return { kind: "mesh", geometry: geo, color: hullColor };
}

export const lightCruiserDef: ArtifactDef = {
  type: "lightCruiser",
  label: "Light Cruiser",
  category: "ships",
  output: "mesh",
  contract: "lightCruiser",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "light_cruiser",
  promptSeed:
    "low-poly Barsoomian light cruiser airship, wide timber boat hull with a raked bow prow spar, two-tier superstructure cabin, a forward twin-barrelled gun turret, twin rear pusher engines on stern outriggers, retro-futuristic, matte, stylized game asset.",
};
