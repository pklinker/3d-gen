import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import {
  frustum, tube, box, dome, cornice, fluting, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.broadcastTower;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 2.0

const params = [
  { key: "baseTiers", label: "Base tiers", kind: "int", min: 2, max: 5, step: 1, default: 3 },
  { key: "shaftTaper", label: "Shaft taper", kind: "number", min: 0.1, max: 0.6, step: 0.02, default: 0.35 },
  { key: "fluteCount", label: "Flute count", kind: "int", min: 4, max: 12, step: 1, default: 8 },
  { key: "mastHeight", label: "Mast height", kind: "number", min: 0.15, max: 0.4, step: 0.02, default: 0.26 },
  { key: "crossbars", label: "Antenna crossbars", kind: "int", min: 0, max: 4, step: 1, default: 2 },
  { key: "beaconColor", label: "Beacon light", kind: "color", default: "#FF5A36" },
  { key: "trimColor", label: "Bronze trim", kind: "color", default: "#C9A24B" },
] as const;

/**
 * Broadcast Tower: a retro-futuristic art-deco radio tower. A wedding-cake stepped ziggurat
 * base (the Base-tiers slider) carries a fluted polygonal shaft up to a slender antenna mast,
 * with horizontal crossbar arms at alternating angles and a beacon light at the very tip. Trim
 * rings mark each setback, scaling in with the global ornamentation slider. Pale anodized steel
 * with bronze trim hardware.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const baseTiers = Math.max(2, Math.round(p.baseTiers as number));
  const shaftTaper = p.shaftTaper as number;
  const fluteCount = Math.max(0, Math.round(p.fluteCount as number));
  const mastHeight = p.mastHeight as number;
  const crossbars = Math.max(0, Math.round(p.crossbars as number));
  const beaconColor = p.beaconColor as string;
  const trimColor = p.trimColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  // Stepped ziggurat base: a stack of square slabs narrowing toward the top, sized to the
  // contract footprint. cornice() also gives us the exact per-tier half-width formula we
  // mirror below to seat the shaft snugly on the top tier.
  const baseHalf = HALF * 0.95;
  const baseH = H * 0.30;
  cornice(P, I, 0, baseHalf, baseTiers, baseH);
  const topTierHalf = baseHalf * (1 - ((baseTiers - 1) / baseTiers) * 0.35);

  // Fluted shaft: a tapering polygon rising from the base's top tier to the mast platform,
  // capped on top so the mast/crossbars seat on a flat deck.
  const sides = 10;
  const shaftBaseR = topTierHalf * 0.82;
  const mastSpan = H * mastHeight;
  const shaftTop = H - mastSpan;
  const shaftTopR = shaftBaseR * (1 - shaftTaper);
  frustum(P, I, [0, baseH, 0], [0, shaftTop, 0], shaftBaseR, shaftTopR, sides, false, true);

  // Vertical chevron fluting in three height bands so the ridges track the shaft's taper
  // instead of drifting off a single constant-radius cylinder.
  if (fluteCount > 0) {
    const fluteRelief = 0.012 + 0.022 * orn;
    const bands = 3;
    for (let b = 0; b < bands; b++) {
      const y0 = baseH + (shaftTop - baseH) * (b / bands);
      const y1 = baseH + (shaftTop - baseH) * ((b + 1) / bands);
      const rMid = shaftBaseR + (shaftTopR - shaftBaseR) * ((y0 + y1) / 2 - baseH) / (shaftTop - baseH);
      fluting(P, I, y0, y1, rMid, fluteRelief, fluteCount, 3);
    }
  }

  // Bronze hardware: thin square trim lips at each square setback (scaling in with
  // ornamentation — a round ring() doesn't sit flush against a square cornice tier, it
  // either cuts through the corners or floats clear of the flat edges), the mast pole,
  // antenna crossbars at alternating angles, and (when heavily ornamented) a small capital
  // cornice under the mast platform. Built contiguously so one paintRange covers it.
  const hwStart = I.length;
  if (orn > 0.3) {
    const step = baseH / baseTiers;
    const trimT = 0.012 + 0.012 * orn;
    for (let k = 0; k <= baseTiers; k++) {
      const tierHalf = baseHalf * (1 - (Math.min(k, baseTiers - 1) / baseTiers) * 0.35);
      const w = tierHalf * 1.04;
      const y0 = Math.max(0, k * step - trimT / 2);
      box(P, I, -w, w, y0, y0 + trimT, -w, w);
    }
  }
  const beaconR = 0.045;
  const mastTopY = H - beaconR;
  frustum(P, I, [0, shaftTop, 0], [0, mastTopY, 0], shaftTopR * 0.4, 0.016, 8, false, false);
  for (let k = 0; k < crossbars; k++) {
    const t = (k + 0.5) / crossbars;
    const y = shaftTop + 0.05 + (mastTopY - shaftTop - 0.1) * t;
    const armLen = (shaftTopR * 1.5 + 0.05) * (1 - 0.15 * t);
    const ang = (k % 2) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    tube(P, I, [-dx * armLen, y, -dz * armLen], [dx * armLen, y, dz * armLen], 0.012, 5, true, true);
  }
  if (orn > 0.5) cornice(P, I, shaftTop - 0.07, shaftTopR * 1.3, 2, 0.07);
  const hwEnd = I.length;

  // Beacon light at the very tip.
  const beaconStart = I.length;
  dome(P, I, 0, 0, mastTopY, beaconR, 3, 8);
  const beaconEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.6), shade(C.color, 1.12));
  weatherRange(geo, 0, hwStart, rng, 0.07); // light seeded scuffing on the steel base/shaft
  paintRange(geo, hwStart, hwEnd, trimColor, 0.9);
  weatherRange(geo, hwStart, hwEnd, rng, 0.06); // tarnish variation on the bronze trim
  paintRange(geo, beaconStart, beaconEnd, beaconColor, 0.95);
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const broadcastTowerDef: ArtifactDef = {
  type: "broadcastTower",
  label: "Broadcast Tower",
  category: "buildings",
  output: "mesh",
  contract: "broadcastTower",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "broadcast_tower",
  promptSeed:
    "low-poly retro-futuristic art-deco Martian broadcast tower, a stepped ziggurat base rising to a fluted shaft topped by a slender radio antenna mast with crossbar arms and a glowing beacon light, anodized steel with bronze trim, matte, stylized game asset.",
};
