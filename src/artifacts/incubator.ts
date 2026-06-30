import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade, makeRng, weatherRange } from "../generation/proceduralEngine";
import {
  tube, frustum, dome, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.incubator;
const HALF = C.footprint / 2; // 0.8

const params = [
  { key: "slope", label: "Wall slope / angle", kind: "number", min: 0, max: 1, step: 0.02, default: 0.42 },
  { key: "ribs", label: "Reinforcement ribs", kind: "int", min: 0, max: 8, step: 1, default: 5 },
  { key: "vent", label: "Ventilation fin scale", kind: "number", min: 0.3, max: 1.3, step: 0.05, default: 0.8 },
  { key: "ribGauge", label: "Rib thickness", kind: "number", min: 0.02, max: 0.07, step: 0.005, default: 0.04 },
] as const;

/** A meridian rib: a chain of short tubes tracing a half great-circle over the dome in the
 *  vertical plane of angle `phi`, from rim up over the crown to the opposite rim. */
function meridianRib(
  P: number[], I: number[],
  phi: number, baseY: number, r: number, gauge: number, segs: number,
): void {
  const pt = (s: number): [number, number, number] => {
    const radial = Math.cos(s) * r;
    return [Math.cos(phi) * radial, baseY + Math.sin(s) * r, Math.sin(phi) * radial];
  };
  for (let i = 0; i < segs; i++) {
    tube(P, I, pt((i / segs) * Math.PI), pt(((i + 1) / segs) * Math.PI), gauge, 4, i === 0, i === segs - 1);
  }
}

/**
 * Fluted Incubator Vault: a squat, armoured dome where a city-state's communal eggs are kept.
 * A battered (outward-sloping) wall ring deflects artillery — the slope slider sets how
 * aggressive the batter is — capped by a heavy dome. Reinforcement ribs arc over the shell
 * like the bands of a turtle's back, and a stylized ventilation grille of radial fins crowns
 * the top, scaled by its slider. Reinforced sandstone with darker metal ribs and vents.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const slope = p.slope as number;
  const ribCount = Math.max(0, Math.round(p.ribs as number));
  const vent = p.vent as number;
  const gauge = p.ribGauge as number;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];
  const SIDES = 14;

  // Battered wall ring: wide at the foot, narrowing to the springline.
  const springY = 0.38;
  const bottomR = HALF;
  const topR = bottomR * (1 - slope * 0.45);
  frustum(P, I, [0, 0, 0], [0, springY, 0], bottomR, topR, SIDES, true, false);

  // Dome cap.
  dome(P, I, 0, 0, springY, topR, 7, SIDES);
  const crownY = springY + topR;

  // Reinforcement ribs arcing over the dome (metal accent). Phase offset so the rib pattern
  // doesn't always start at the same world angle.
  const ribStart = I.length;
  const ribPhase = ribCount > 0 ? (rng() * Math.PI) / ribCount : 0;
  for (let i = 0; i < ribCount; i++) {
    meridianRib(P, I, ribPhase + (i / ribCount) * Math.PI, springY, topR + gauge * 0.5, gauge, 7);
  }
  // A waist band at the springline ties the ribs to the wall.
  if (ribCount > 0) frustum(P, I, [0, springY - gauge, 0], [0, springY + gauge, 0], topR + gauge, topR + gauge, SIDES, false, false);
  const ribEnd = I.length;

  // Ventilation grille: a short drum of radial fins at the crown.
  const ventStart = I.length;
  const vr = 0.13 * vent;
  const vh = 0.12 * vent;
  frustum(P, I, [0, crownY - 0.02, 0], [0, crownY + vh * 0.5, 0], vr, vr * 0.8, 8, true, true);
  const finN = 8;
  const finPhase = rng() * (Math.PI * 2) / finN;
  for (let i = 0; i < finN; i++) {
    const a = finPhase + (i / finN) * Math.PI * 2;
    const x = Math.cos(a) * vr * 0.78, z = Math.sin(a) * vr * 0.78;
    frustum(P, I, [x, crownY, z], [x, crownY + vh, z], 0.018, 0.01, 4, true, true, a);
  }
  const ventEnd = I.length;

  // Ornament: stepped cornice ledges banding the battered wall (kept in the stone palette).
  if (orn > 0.05) {
    for (let k = 1; k <= (orn > 0.5 ? 2 : 1); k++) {
      const fy = springY * (k / 3);
      const fr = (bottomR + (topR - bottomR) * (fy / springY)) * 1.02 + 0.02 * orn;
      frustum(P, I, [0, fy - 0.02, 0], [0, fy + 0.02, 0], fr, fr, SIDES, false, false);
    }
  }

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.6), shade(C.color, 1.08));
  weatherRange(geo, 0, ribStart, rng, 0.08); // seeded per-facet weathering on the sandstone shell
  paintRange(geo, ribStart, ribEnd, "#6F6A5C", 0.85); // ribs: dark iron-stone
  paintRange(geo, ventStart, ventEnd, "#7E8890", 0.85); // vent grille: metal
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const incubatorDef: ArtifactDef = {
  type: "incubator",
  label: "Incubator Vault",
  category: "buildings",
  output: "mesh",
  contract: "incubator",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "incubator",
  promptSeed:
    "low-poly armoured Martian incubator vault, squat reinforced dome with battered sloping walls, heavy structural ribs over the shell and a ventilation grille on top, matte, stylized game asset.",
};
