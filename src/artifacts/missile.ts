import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { paintRange, paintWhere, buildGeometry } from "../generation/primitives";
import { buildBodyOfRevolution, buildTailFin, type ProfilePoint } from "./ordnanceBase";

const C = MESH_CONTRACTS.missile;
const HALF = C.footprint / 2; // 0.25
const SIDES = 8;

const params = [
  { key: "bodyRadius", label: "Body radius", kind: "number", min: 0.045, max: 0.07, step: 0.005, default: 0.058 },
  { key: "noseFrac", label: "Nose length", kind: "number", min: 0.25, max: 0.45, step: 0.02, default: 0.34 },
  { key: "finCount", label: "Fin count", kind: "int", min: 3, max: 4, step: 1, default: 4 },
  { key: "finSpan", label: "Fin span", kind: "number", min: 0.05, max: 0.085, step: 0.005, default: 0.065 },
  { key: "bodyColor", label: "Body color", kind: "color", default: C.color },
  { key: "bandColor", label: "Warning band", kind: "color", default: "#D6B23A" },
] as const;

/**
 * Missile: a slender body of revolution — a sharp pointed nose, cylindrical body, a tapered
 * exhaust nozzle at the tail, and swept fins. Horizontally oriented along Z like the ships
 * (+Z = nose, -Z = tail). Olive-grey body with a painted warning band and pale steel fins.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const bodyRadius = p.bodyRadius as number;
  const noseFrac = p.noseFrac as number;
  const finCount = Math.max(3, Math.round(p.finCount as number));
  const finSpan = p.finSpan as number;
  const bodyColor = p.bodyColor as string;
  const bandColor = p.bandColor as string;

  const P: number[] = [];
  const I: number[] = [];

  const tailZ = -HALF;
  const noseZ = HALF;
  const noseStartZ = HALF - C.footprint * noseFrac;

  const profile: ProfilePoint[] = [
    { z: tailZ, r: bodyRadius * 0.45 },
    { z: tailZ + C.footprint * 0.06, r: bodyRadius },
    { z: noseStartZ, r: bodyRadius },
    { z: noseZ, r: 0 },
  ];
  buildBodyOfRevolution(P, I, profile, SIDES);

  // Swept tail fins, trailing edge flush with the tail.
  const finStart = I.length;
  const finRootZ = tailZ + C.footprint * 0.16;
  const finTipZ = tailZ;
  const finOuterRoot = bodyRadius + finSpan * 0.35;
  const finOuterTip = bodyRadius + finSpan;
  for (let i = 0; i < finCount; i++) {
    const ang = (i / finCount) * Math.PI * 2 + (rng() - 0.5) * 0.04;
    buildTailFin(P, I, ang, finRootZ, finTipZ, bodyRadius * 0.98, finOuterRoot, finOuterTip, 0.012);
  }
  const finEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(bodyColor, 0.6), shade(bodyColor, 1.15));
  weatherRange(geo, 0, finEnd, rng, 0.08); // seeded per-facet weathering across body + fins
  paintRange(geo, finStart, finEnd, "#7E8890", 0.85); // fins: pale steel
  const bandZ0 = tailZ + C.footprint * 0.32;
  const bandZ1 = bandZ0 + C.footprint * 0.05;
  paintWhere(geo, (_x, _y, z) => z >= bandZ0 && z <= bandZ1, bandColor, 0.9); // warning band
  return { kind: "mesh", geometry: geo, color: bodyColor };
}

export const missileDef: ArtifactDef = {
  type: "missile",
  label: "Missile",
  category: "ordnance",
  output: "mesh",
  contract: "missile",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "missile",
  promptSeed:
    "low-poly retro-futuristic guided missile, slender body of revolution with a sharp pointed nose, a painted warning band, swept tail fins and a tapered exhaust nozzle, matte olive-grey, stylized game asset.",
};
