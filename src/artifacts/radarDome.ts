import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { frustum, tube, dome, paintRange, buildGeometry } from "../generation/primitives";
import { buildTurretBase } from "./turretBase";

const C = MESH_CONTRACTS.radarDome;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 0.62

const params = [
  { key: "housingShape", label: "Housing shape (round ↔ boxy)", kind: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
  { key: "domeRadius", label: "Dome radius", kind: "number", min: 0.12, max: 0.18, step: 0.01, default: 0.15 },
  { key: "facetDensity", label: "Geodesic facet density", kind: "int", min: 5, max: 14, step: 1, default: 9 },
  { key: "greebleDensity", label: "Greeble density", kind: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "armorColor", label: "Armor color", kind: "color", default: C.color },
  { key: "domeColor", label: "Radome color", kind: "color", default: "#D8DCDA" },
] as const;

/**
 * Radar Dome: the turret-family base (see turretBase.ts) topped by a faceted geodesic radome
 * on a low collar — unlike the dish/array, this never tilts (a radome is a static weatherproof
 * shell over the actual antenna inside it), so it's just a dome() cap seated dead-center on the
 * roof, plus a seam ring at its equator and a small lightning-rod/GPS nub at the apex. The
 * facet-density slider doubles as the radome's "panel count" — low values read as a chunky
 * geodesic golf-ball, high values approach a smooth sphere.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const housingShape = p.housingShape as number;
  const domeRadius = p.domeRadius as number;
  const facetDensity = Math.max(5, Math.round(p.facetDensity as number));
  const greebleDensity = p.greebleDensity as number;
  const armorColor = p.armorColor as string;
  const domeColor = p.domeColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const { topY, topR, trimStart, trimEnd } =
    buildTurretBase(P, I, rng, H, HALF, housingShape, greebleDensity, orn);

  // Low collar the radome seats on.
  const collarR = Math.min(topR * 0.85, domeRadius * 1.05);
  const collarH = 0.04;
  const collarStart = I.length;
  frustum(P, I, [0, topY, 0], [0, topY + collarH, 0], collarR, collarR * 0.96, Math.max(10, facetDensity), false, true);
  const collarEnd = I.length;

  // Faceted geodesic radome cap, plus a seam ring at its equator and a small apex nub.
  const domeY = topY + collarH;
  const domeStart = I.length;
  dome(P, I, 0, 0, domeY, domeRadius, Math.max(3, Math.round(facetDensity * 0.6)), facetDensity);
  tube(P, I, [0, domeY + domeRadius - 0.01, 0], [0, domeY + domeRadius + 0.04, 0], 0.01, 5, false, true);
  const domeEnd = I.length;

  const seamStart = I.length;
  if (orn > 0.2) {
    const st = 0.008 + 0.008 * orn;
    frustum(P, I, [0, domeY - st, 0], [0, domeY + st, 0], domeRadius * 1.02, domeRadius * 1.02, Math.max(12, facetDensity), false, false);
  }
  const seamEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(armorColor, 0.6), shade(armorColor, 1.12));
  weatherRange(geo, 0, collarStart, rng, 0.09); // seeded per-facet weathering on the hull + trim + greebles
  paintRange(geo, trimStart, trimEnd, "#3A3D40", 0.7); // trim band: darker steel
  paintRange(geo, collarStart, collarEnd, "#3A3D40", 0.8); // collar: darker steel
  weatherRange(geo, collarStart, collarEnd, rng, 0.08);
  paintRange(geo, domeStart, domeEnd, domeColor, 0.92); // radome + apex nub
  weatherRange(geo, domeStart, domeEnd, rng, 0.05); // composite shells weather less than bare steel
  paintRange(geo, seamStart, seamEnd, "#9CA3A8", 0.6); // equator seam: a touch darker than the shell
  return { kind: "mesh", geometry: geo, color: armorColor };
}

export const radarDomeDef: ArtifactDef = {
  type: "radarDome",
  label: "Radar Dome",
  category: "buildings",
  output: "mesh",
  contract: "radarDome",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "radar_dome",
  promptSeed:
    "low-poly retro-futuristic Martian radar dome station, a stepped armored tower on a flared pyramidal base covered in riveted armor-plate seams, vents and hatches, topped by a faceted geodesic radome on a low collar, matte gunmetal steel and pale composite radome, stylized game asset.",
};
