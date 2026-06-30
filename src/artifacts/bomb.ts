import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { paintRange, paintWhere, buildGeometry } from "../generation/primitives";
import { buildBodyOfRevolution, buildTailFin, type ProfilePoint } from "./ordnanceBase";

const C = MESH_CONTRACTS.bomb;
const HALF = C.footprint / 2; // 0.2
const SIDES = 8;

const params = [
  { key: "bodyRadius", label: "Body radius", kind: "number", min: 0.065, max: 0.09, step: 0.005, default: 0.078 },
  { key: "noseBlunt", label: "Nose bluntness", kind: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
  { key: "finCount", label: "Fin count", kind: "int", min: 3, max: 4, step: 1, default: 4 },
  { key: "finSpan", label: "Fin span", kind: "number", min: 0.035, max: 0.06, step: 0.005, default: 0.045 },
  { key: "bodyColor", label: "Body color", kind: "color", default: C.color },
  { key: "tipColor", label: "Nose tip", kind: "color", default: "#D6B23A" },
] as const;

/**
 * Bomb: a stubby teardrop body of revolution — a rounded blunt nose (the bluntness slider
 * eases the taper steps), a fat midsection, and short blocky cruciform tail fins. Shorter and
 * fatter than the missile. Horizontally oriented along Z (+Z = nose, -Z = tail). Olive-drab
 * matte paint with a painted nose-fuze tip and pale steel fins.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const bodyRadius = p.bodyRadius as number;
  const noseBlunt = p.noseBlunt as number;
  const finCount = Math.max(3, Math.round(p.finCount as number));
  const finSpan = p.finSpan as number;
  const bodyColor = p.bodyColor as string;
  const tipColor = p.tipColor as string;

  const P: number[] = [];
  const I: number[] = [];

  const tailZ = -HALF;
  const noseZ = HALF;

  // Teardrop profile: short tail taper, a fat cylindrical waist, then the nose rounds off in
  // a couple of steps whose radii ease toward a flatter (blunter) curve as noseBlunt rises.
  const profile: ProfilePoint[] = [
    { z: tailZ, r: bodyRadius * 0.4 },
    { z: tailZ + C.footprint * 0.06, r: bodyRadius },
    { z: tailZ + C.footprint * 0.1, r: bodyRadius },
    { z: HALF * 0.05, r: bodyRadius },
    { z: HALF * (0.55 - 0.1 * noseBlunt), r: bodyRadius * (0.92 - 0.12 * noseBlunt) },
    { z: HALF * (0.82 - 0.1 * noseBlunt), r: bodyRadius * (0.55 - 0.15 * noseBlunt) },
    { z: noseZ, r: bodyRadius * 0.12 * noseBlunt },
  ];
  buildBodyOfRevolution(P, I, profile, SIDES);

  // Short blocky cruciform tail fins.
  const finStart = I.length;
  const finRootZ = tailZ + C.footprint * 0.22;
  const finTipZ = tailZ;
  const finOuterRoot = bodyRadius + finSpan * 0.5;
  const finOuterTip = bodyRadius + finSpan;
  for (let i = 0; i < finCount; i++) {
    const ang = (i / finCount) * Math.PI * 2 + (rng() - 0.5) * 0.04;
    buildTailFin(P, I, ang, finRootZ, finTipZ, bodyRadius * 0.98, finOuterRoot, finOuterTip, 0.018);
  }
  const finEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(bodyColor, 0.62), shade(bodyColor, 1.1));
  weatherRange(geo, 0, finEnd, rng, 0.08); // seeded per-facet weathering across body + fins
  paintRange(geo, finStart, finEnd, "#7E8890", 0.85); // fins: pale steel
  const tipZ0 = noseZ - C.footprint * 0.08;
  paintWhere(geo, (_x, _y, z) => z >= tipZ0, tipColor, 0.85); // fuze tip
  return { kind: "mesh", geometry: geo, color: bodyColor };
}

export const bombDef: ArtifactDef = {
  type: "bomb",
  label: "Bomb",
  category: "ordnance",
  output: "mesh",
  contract: "bomb",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "bomb",
  promptSeed:
    "low-poly retro-futuristic aerial bomb, a stubby teardrop body of revolution with a rounded nose, a painted fuze tip and short blocky cruciform tail fins, matte olive-drab, stylized game asset.",
};
