import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, dome, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.cruiser;

const params = [
  { key: "cabin",      label: "Cabin size",      kind: "number", min: 0.3, max: 0.7, step: 0.02, default: 0.5 },
  { key: "prowLength", label: "Prow length",     kind: "number", min: 0,   max: 1,  step: 0.05, default: 0.6 },
  { key: "blades",     label: "Propeller blades", kind: "int",    min: 0,   max: 8,  step: 1,    default: 4 },
  { key: "engineSpan", label: "Engine span",       kind: "number", min: 0.2, max: 0.5, step: 0.02, default: 0.34 },
  { key: "hullColor",  label: "Hull color",        kind: "color",  default: C.color },
  { key: "cabinColor", label: "Cabin color",        kind: "color",  default: "#9A8C70" },
  { key: "flagColor",  label: "Flag color",          kind: "color",  default: "#5A86C8" },
] as const;

// Build axis: +Z = bow (forward), -Z = stern.
const HALF = 0.78;
const WMAX = 0.30;
const DECK = 0.28;

/** Hull cross-section at station t (0 = stern, 1 = bow). */
function station(t: number): { z: number; w: number; deckY: number; keelY: number } {
  const z = -HALF + t * 2 * HALF;
  const w = WMAX * Math.max(0.05, 1 - Math.pow(Math.abs((t - 0.45) / 0.55), 1.5));
  const deckY = DECK + 0.14 * Math.pow(t, 1.5) + 0.04 * Math.pow(1 - t, 2);
  const keelY = 0.02 + 0.10 * Math.pow(Math.abs(t - 0.5) * 2, 1.8);
  return { z, w, deckY, keelY };
}

/** Deck height at world z. */
function deckAt(z: number): number {
  const t = (z + HALF) / (2 * HALF);
  return station(Math.min(1, Math.max(0, t))).deckY;
}

/** One 8-point hull ring. */
function ringAt(P: number[], t: number): { idx: number[]; cy: number; z: number } {
  const { z, w, deckY, keelY } = station(t);
  const cy = (deckY + keelY) / 2 + 0.02;
  const pts: [number, number][] = [
    [w,         deckY],
    [w * 0.78,  cy + (deckY - cy) * 0.45],
    [w * 0.42,  cy],
    [w * 0.20,  keelY],
    [-w * 0.20, keelY],
    [-w * 0.42, cy],
    [-w * 0.78, cy + (deckY - cy) * 0.45],
    [-w,        deckY],
  ];
  const idx = pts.map(([x, y]) => { P.push(x, y, z); return P.length / 3 - 1; });
  return { idx, cy, z };
}

/** Build a twin-barrelled gun turret. barrelDir = +1 for bow, -1 for stern. */
function gunTurret(
  P: number[], I: number[],
  tz: number, barrelDir: number,
): void {
  const tBase  = deckAt(tz) - 0.01;
  const tR     = 0.10;
  const tBodyH = 0.07;
  const tBodyR = 0.082;

  frustum(P, I, [0, tBase, tz],              [0, tBase + 0.035, tz],              tR,           tR * 0.90,   8, true,  false);
  frustum(P, I, [0, tBase + 0.035, tz],      [0, tBase + 0.035 + tBodyH, tz],    tR * 0.90,    tBodyR * 0.75, 8, false, false);
  dome(P, I, 0, tz, tBase + 0.035 + tBodyH, tBodyR * 0.75, 2, 8);

  const barrelY  = tBase + 0.035 + tBodyH * 0.55;
  const barrelZ0 = tz + barrelDir * 0.01;
  const barrelZ1 = tz + barrelDir * 0.26;
  for (const sgn of [-1, 1]) {
    tube(P, I, [sgn * 0.025, barrelY, barrelZ0], [sgn * 0.025, barrelY, barrelZ1], 0.018, 6, true, false);
    tube(P, I, [sgn * 0.025, barrelY, barrelZ1 - barrelDir * 0.025],
               [sgn * 0.025, barrelY, barrelZ1 + barrelDir * 0.012], 0.024, 6, false, true);
  }
}

/**
 * Cruiser: identical to the Light Cruiser but armed with a second twin-barrelled gun turret
 * at the stern, covering the rear arc. Layout bow→stern: raked prow spar, forward turret,
 * two-tier cabin, mast, rear turret (barrels facing aft), twin rear pusher engines.
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
  const STA = 14, N = 8;
  const rings: { idx: number[]; cy: number; z: number }[] = [];
  for (let i = 0; i <= STA; i++) rings.push(ringAt(P, i / STA));
  for (let i = 0; i < STA; i++) {
    const a = rings[i], b = rings[i + 1];
    const refY = (a.cy + b.cy) / 2, refZ = (a.z + b.z) / 2;
    for (let j = 0; j < N; j++) {
      const jn = (j + 1) % N;
      outQuad(P, I, a.idx[j], a.idx[jn], b.idx[jn], b.idx[j], 0, refY, refZ);
    }
  }
  const sternRing = rings[0];
  for (let j = 1; j < N - 1; j++)
    outTri(P, I, sternRing.idx[0], sternRing.idx[j], sternRing.idx[j + 1], 0, sternRing.cy, sternRing.z + 0.2);

  // ── Bow prow spar + stern outrigger pylons (brass) ───────────────────────────
  const brassStart = I.length;
  if (prowLength > 0) {
    const bow = station(1);
    const tip: [number, number, number] = [0, bow.deckY, bow.z];
    const end: [number, number, number] = [0, bow.deckY + 0.22 * prowLength, bow.z + 0.22 * prowLength];
    tube(P, I, tip, end, 0.025, 6, true, true);
  }
  const engSt = station(0.20);
  const engY  = (engSt.deckY + engSt.keelY) / 2 + 0.02;
  const engZ  = engSt.z;
  for (const sgn of [-1, 1]) {
    frustum(P, I, [sgn * engSt.w * 0.85, engY, engZ], [sgn * engineSpan, engY, engZ], 0.045, 0.055, 5, true, false);
  }
  const brassEnd = I.length;

  // ── Cabin / superstructure ───────────────────────────────────────────────────
  const cabinStart = I.length;
  {
    const st  = station(0.50);
    const base = deckAt(st.z) - 0.01;
    const hw = 0.16 + 0.06 * cabinSize, hz = 0.13 + 0.14 * cabinSize;
    const h1 = 0.10 + 0.08 * cabinSize, h2 = 0.07 + 0.04 * cabinSize;
    box(P, I, -hw, hw, base, base + h1, st.z - hz, st.z + hz);
    const bw = hw * 0.7, bz = hz * 0.75;
    box(P, I, -bw, bw, base + h1, base + h1 + h2, st.z - bz, st.z + bz);
    box(P, I, -bw * 0.85, bw * 0.85, base + h1 + h2, base + h1 + h2 + 0.025, st.z - bz * 0.85, st.z + bz * 0.85);
  }
  const cabinEnd = I.length;

  // ── Forward turret (barrels toward bow) + rear turret (barrels toward stern) ─
  const turretStart = I.length;
  gunTurret(P, I, station(0.70).z,  1); // forward, barrels face +Z
  gunTurret(P, I, station(0.30).z, -1); // rear,    barrels face -Z
  const turretEnd = I.length;

  // ── Mast + pennant (placed between turrets, above cabin aft end) ─────────────
  const mastStart = I.length;
  const mastSt  = station(0.40);
  const mastTopY = 0.82;
  tube(P, I, [0, mastSt.deckY, mastSt.z], [0, mastTopY, mastSt.z], 0.016, 5, false, true);
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
  const nl = 0.22, nr = 0.068;
  const frontZ = engZ + nl * 0.45, backZ = engZ - nl * 0.55;
  for (const sgn of [-1, 1]) {
    const ex = sgn * engineSpan;
    tube(P, I,    [ex, engY, frontZ], [ex, engY, backZ], nr, 8, true, false);
    frustum(P, I, [ex, engY, backZ],  [ex, engY, backZ - 0.06], nr, 0, 8, false, false);
    const discZ = backZ - 0.035;
    for (let i = 0; i < blades; i++) {
      const ang = (i / Math.max(1, blades)) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const inner: [number, number, number] = [ex + ca * 0.05, engY + sa * 0.05, discZ];
      const outer: [number, number, number] = [ex + ca * 0.17, engY + sa * 0.17, discZ];
      frustum(P, I, inner, outer, 0.028, 0.011, 4, true, true, ang);
    }
  }
  const metalEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(hullColor, 0.55), shade(hullColor, 1.15));
  paintRange(geo, brassStart,  brassEnd,  "#B8893C", 0.90); // prow + outrigger pylons: brass
  paintRange(geo, cabinStart,  cabinEnd,  cabinColor, 0.95); // superstructure
  paintRange(geo, turretStart, turretEnd, "#8A8F96", 0.90); // both gun turrets: steel
  paintRange(geo, mastStart,   mastEnd,   "#7E8890", 0.85); // mast: pale metal
  paintRange(geo, flagStart,   flagEnd,   flagColor, 0.95); // pennant cloth
  paintRange(geo, metalStart,  metalEnd,  "#8A8F96", 0.90); // nacelles + propellers: steel
  return { kind: "mesh", geometry: geo, color: hullColor };
}

export const cruiserDef: ArtifactDef = {
  type: "cruiser",
  label: "Cruiser",
  category: "ships",
  output: "mesh",
  contract: "cruiser",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "cruiser",
  promptSeed:
    "low-poly Barsoomian cruiser airship, wide timber boat hull with a raked bow prow spar, two-tier superstructure cabin, a forward and a rear twin-barrelled gun turret, twin rear pusher engines on stern outriggers, retro-futuristic, matte, stylized game asset.",
};
