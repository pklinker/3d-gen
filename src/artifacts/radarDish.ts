import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { frustum, tube, paintRange, buildGeometry } from "../generation/primitives";
import { buildTurretBase } from "./turretBase";

const C = MESH_CONTRACTS.radarDish;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 0.78

const params = [
  { key: "housingShape", label: "Housing shape (round ↔ boxy)", kind: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
  { key: "dishRadius", label: "Dish radius", kind: "number", min: 0.15, max: 0.22, step: 0.01, default: 0.19 },
  { key: "elevation", label: "Dish elevation", kind: "number", min: 20, max: 70, step: 1, default: 42 },
  { key: "greebleDensity", label: "Greeble density", kind: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "armorColor", label: "Armor color", kind: "color", default: C.color },
  { key: "dishColor", label: "Dish color", kind: "color", default: "#B8BCBE" },
] as const;

/**
 * Radar Dish: the turret-family base (see turretBase.ts) topped by a concave dish on a twin-
 * fork yoke, tilted skyward. The dish is a hollow cone (capped narrow back, open wide rim) so
 * it reads as a satellite-style bowl rather than a solid blob; a thin boom carries a feed horn
 * out in front of it, slung from the rim's low edge. The yoke's two posts and cross-axle sit
 * fixed along local Z — the elevation tilt happens entirely in the X/Y plane around that axle,
 * so the dish always seats cleanly between the forks regardless of angle.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const housingShape = p.housingShape as number;
  const dishRadius = p.dishRadius as number;
  const elevation = (p.elevation as number) * (Math.PI / 180);
  const greebleDensity = p.greebleDensity as number;
  const armorColor = p.armorColor as string;
  const dishColor = p.dishColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const { topY, topR, trimStart, trimEnd } =
    buildTurretBase(P, I, rng, H, HALF, housingShape, greebleDensity, orn);

  // Twin-fork yoke: two posts at fixed lateral (Z) offsets up to a cross-axle, with the dish's
  // back mounted at the axle's center — the elevation tilt then only ever moves things in the
  // X/Y plane, never the axle itself, so the joint always reads as flush.
  // Counter-intuitively, low elevation is the worst case for the bounding-box *height*, not
  // the best: a wide dish held close to vertical (facing forward) swings its full diameter
  // into the Y axis, while a high-elevation dish lies closer to flat and contributes more to
  // the footprint instead. dishRadius/elevation ranges and yokeRise are tuned so that swing
  // stays inside the contract's height tolerance at every combination — see radar-validate
  // stress test before loosening either range.
  const yokeStart = I.length;
  const yokeHalfWidth = dishRadius * 0.55;
  const yokeRise = 0.06;
  const postR = topR * 0.1;
  const axleY = topY + yokeRise;
  for (const sgn of [-1, 1]) {
    tube(P, I, [0, topY, sgn * yokeHalfWidth], [0, axleY, sgn * yokeHalfWidth], postR, 6, true, false);
  }
  tube(P, I, [0, axleY, -yokeHalfWidth], [0, axleY, yokeHalfWidth], postR * 0.7, 6, true, true);
  const yokeEnd = I.length;

  // Dish: a hollow cone — capped narrow back, open wide rim — oriented along the elevation
  // direction so it reads as a concave bowl rather than a solid cone.
  const dir: [number, number] = [Math.cos(elevation), Math.sin(elevation)];
  const dishDepth = dishRadius * 0.32;
  const pivot: [number, number, number] = [0, axleY, 0];
  const rimCenter: [number, number, number] = [pivot[0] + dir[0] * dishDepth, pivot[1] + dir[1] * dishDepth, 0];
  const dishStart = I.length;
  frustum(P, I, pivot, rimCenter, 0.022, dishRadius, 14, true, false);

  // Feed horn boom: slung from the rim's low edge (perpendicular to the tilt direction) out
  // to a focal point in front of the dish.
  const perp: [number, number] = [-dir[1], dir[0]];
  const rimLow: [number, number, number] = [
    rimCenter[0] - perp[0] * dishRadius * 0.92,
    rimCenter[1] - perp[1] * dishRadius * 0.92,
    0,
  ];
  const focal: [number, number, number] = [
    rimCenter[0] + dir[0] * dishRadius * 0.4,
    rimCenter[1] + dir[1] * dishRadius * 0.4,
    0,
  ];
  tube(P, I, rimLow, focal, 0.012, 5, true, false);
  tube(P, I, focal, [focal[0] + dir[0] * 0.025, focal[1] + dir[1] * 0.025, 0], 0.018, 6, false, true);
  const dishEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(armorColor, 0.6), shade(armorColor, 1.12));
  weatherRange(geo, 0, yokeStart, rng, 0.09); // seeded per-facet weathering on the hull + trim + greebles
  paintRange(geo, trimStart, trimEnd, "#3A3D40", 0.7); // trim band: darker steel
  paintRange(geo, yokeStart, yokeEnd, "#3A3D40", 0.85); // yoke: darker steel
  weatherRange(geo, yokeStart, yokeEnd, rng, 0.08);
  paintRange(geo, dishStart, dishEnd, dishColor, 0.92); // dish + feed boom
  weatherRange(geo, dishStart, dishEnd, rng, 0.07);
  return { kind: "mesh", geometry: geo, color: armorColor };
}

export const radarDishDef: ArtifactDef = {
  type: "radarDish",
  label: "Radar Dish",
  category: "buildings",
  output: "mesh",
  contract: "radarDish",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "radar_dish",
  promptSeed:
    "low-poly retro-futuristic Martian radar dish station, a stepped armored tower on a flared pyramidal base covered in riveted armor-plate seams, vents and hatches, topped by a concave radar dish on a twin-fork yoke tilted skyward with a feed-horn boom, matte gunmetal steel and pale dish paint, stylized game asset.",
};
