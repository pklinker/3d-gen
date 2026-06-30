import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { frustum, paintRange, paintWhere, buildGeometry } from "../generation/primitives";
import { buildBodyOfRevolution, buildTailFin, type ProfilePoint } from "./ordnanceBase";

const C = MESH_CONTRACTS.torpedo;
const HALF = C.footprint / 2; // 0.3
const SIDES = 8;

const params = [
  { key: "bodyRadius", label: "Body radius", kind: "number", min: 0.04, max: 0.06, step: 0.005, default: 0.05 },
  { key: "propBlades", label: "Propeller blades", kind: "int", min: 2, max: 5, step: 1, default: 4 },
  { key: "finCount", label: "Rudder fin count", kind: "int", min: 3, max: 4, step: 1, default: 4 },
  { key: "finSpan", label: "Fin span", kind: "number", min: 0.025, max: 0.045, step: 0.005, default: 0.035 },
  { key: "bodyColor", label: "Body color", kind: "color", default: C.color },
  { key: "bandColor", label: "Stripe band", kind: "color", default: "#D6B23A" },
] as const;

/**
 * Torpedo: the longest, slenderest of the ordnance class — a blunt rounded nose, a long
 * cylindrical body, small rudder fins, and a tail propeller on a short shaft. Horizontally
 * oriented along Z (+Z = nose, -Z = tail). Dark gunmetal with a painted stripe band and pale
 * steel fins/propeller.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const bodyRadius = p.bodyRadius as number;
  const propBlades = Math.max(2, Math.round(p.propBlades as number));
  const finCount = Math.max(3, Math.round(p.finCount as number));
  const finSpan = p.finSpan as number;
  const bodyColor = p.bodyColor as string;
  const bandColor = p.bandColor as string;

  const P: number[] = [];
  const I: number[] = [];

  const tailZ = -HALF;
  const noseZ = HALF;

  const profile: ProfilePoint[] = [
    { z: tailZ, r: bodyRadius * 0.3 }, // propeller shaft cap
    { z: tailZ + C.footprint * 0.05, r: bodyRadius * 0.55 },
    { z: tailZ + C.footprint * 0.12, r: bodyRadius },
    { z: HALF * 0.5, r: bodyRadius },
    { z: HALF * 0.85, r: bodyRadius * 0.8 },
    { z: noseZ, r: bodyRadius * 0.35 }, // blunt rounded nose (flat cap)
  ];
  buildBodyOfRevolution(P, I, profile, SIDES);

  // Small rudder fins, set forward of the propeller so they don't clip its sweep.
  const finStart = I.length;
  const finRootZ = tailZ + C.footprint * 0.2;
  const finTipZ = tailZ + C.footprint * 0.05;
  const finOuterRoot = bodyRadius + finSpan * 0.4;
  const finOuterTip = bodyRadius + finSpan;
  for (let i = 0; i < finCount; i++) {
    const ang = (i / finCount) * Math.PI * 2 + (rng() - 0.5) * 0.04;
    buildTailFin(P, I, ang, finRootZ, finTipZ, bodyRadius * 0.98, finOuterRoot, finOuterTip, 0.01);
  }
  const finEnd = I.length;

  // Tail propeller on a short shaft, plus a small spinner cap behind it.
  const propStart = I.length;
  const propZ = tailZ - 0.006;
  const propInnerR = bodyRadius * 0.35;
  const propOuterR = bodyRadius * 1.6;
  for (let i = 0; i < propBlades; i++) {
    const ang = (i / propBlades) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const inner: [number, number, number] = [ca * propInnerR, sa * propInnerR, propZ];
    const outer: [number, number, number] = [ca * propOuterR, sa * propOuterR, propZ];
    frustum(P, I, inner, outer, 0.018, 0.008, 4, true, true, ang);
  }
  frustum(P, I, [0, 0, propZ], [0, 0, propZ - 0.018], bodyRadius * 0.3, bodyRadius * 0.12, 6, false, true);
  const propEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(bodyColor, 0.62), shade(bodyColor, 1.12));
  weatherRange(geo, 0, finEnd, rng, 0.08); // seeded per-facet weathering across body + fins
  paintRange(geo, finStart, finEnd, "#7E8890", 0.85); // fins: pale steel
  paintRange(geo, propStart, propEnd, "#7E8890", 0.9); // propeller + spinner: pale steel
  weatherRange(geo, propStart, propEnd, rng, 0.07);
  const bandZ0 = tailZ + C.footprint * 0.42;
  const bandZ1 = bandZ0 + C.footprint * 0.04;
  paintWhere(geo, (_x, _y, z) => z >= bandZ0 && z <= bandZ1, bandColor, 0.85); // stripe band
  return { kind: "mesh", geometry: geo, color: bodyColor };
}

export const torpedoDef: ArtifactDef = {
  type: "torpedo",
  label: "Torpedo",
  category: "ordnance",
  output: "mesh",
  contract: "torpedo",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "torpedo",
  promptSeed:
    "low-poly retro-futuristic torpedo, a long slender body of revolution with a blunt rounded nose, a painted stripe band, small rudder fins and a tail propeller, matte dark gunmetal, stylized game asset.",
};
