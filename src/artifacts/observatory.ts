import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade, makeRng, weatherRange } from "../generation/proceduralEngine";
import {
  tube, frustum, ring, dome, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.observatory; // height 2.3, driven by the stretchable middle column

const params = [
  { key: "segHeight", label: "Minaret segment height", kind: "number", min: 0.7, max: 1.5, step: 0.02, default: 1.05 },
  { key: "angle", label: "Telescope angle", kind: "number", min: 0, max: 80, step: 1, default: 45 },
  { key: "weight", label: "Counterweight scale", kind: "number", min: 0.5, max: 1.6, step: 0.05, default: 1.0 },
  { key: "barrel", label: "Telescope length", kind: "number", min: 0.3, max: 0.6, step: 0.02, default: 0.45 },
] as const;

/**
 * Astronomical Observatory / Astrological Minaret: a hyper-tall, slender stone minaret with a
 * stretchable middle column (the segment-height slider drives the precarious height), a balcony
 * ring, and an observation platform carrying a brass telescope on a yoke. The barrel pivots up
 * into the sky by the angle slider; circular brass counterweights at its breech balance it and
 * scale with their own slider. Pale stone shaft, brass instrument.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const seg = p.segHeight as number;
  const angle = ((p.angle as number) * Math.PI) / 180;
  const weight = p.weight as number;
  const barrelLen = p.barrel as number;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];
  const SIDES = 10;

  // Stacked shaft: wide base drum, slender stretchable middle, upper drum.
  const baseTop = 0.34;
  frustum(P, I, [0, 0, 0], [0, baseTop, 0], 0.33, 0.24, SIDES, true, false);
  const midTop = baseTop + seg;
  frustum(P, I, [0, baseTop, 0], [0, midTop, 0], 0.2, 0.17, SIDES, false, false);
  const upperTop = midTop + 0.28;
  frustum(P, I, [0, midTop, 0], [0, upperTop, 0], 0.19, 0.21, SIDES, false, false);

  // Balcony ring at the middle/upper joint and a railed observation platform on top.
  ring(P, I, 0, midTop, 0, 0.24, 0.03, 12, 5);
  const platformY = upperTop + 0.06;
  frustum(P, I, [0, upperTop, 0], [0, platformY, 0], 0.21, 0.34, SIDES, false, true);
  ring(P, I, 0, platformY + 0.08, 0, 0.32, 0.02, 14, 4); // railing

  // Ornament: cornice bands on the shaft, scaled by the global slider.
  if (orn > 0.05) {
    const tr = 0.018 + 0.022 * orn;
    ring(P, I, 0, baseTop, 0, 0.26, tr, 12, 5);
    ring(P, I, 0, midTop - 0.04, 0, 0.2, tr * 0.8, 12, 5);
    if (orn > 0.5) ring(P, I, 0, (baseTop + midTop) / 2, 0, 0.19, tr * 0.7, 12, 5);
  }

  // Brass instrument: yoke posts, a pivoted barrel angled up, breech counterweights.
  const brassStart = I.length;
  const pivot: [number, number, number] = [0, platformY + 0.14, 0];
  tube(P, I, [-0.12, platformY, 0], [-0.04, pivot[1], 0], 0.022, 5, true, true); // yoke L
  tube(P, I, [0.12, platformY, 0], [0.04, pivot[1], 0], 0.022, 5, true, true); // yoke R
  const dir: [number, number, number] = [Math.cos(angle), Math.sin(angle), 0];
  const lens: [number, number, number] = [pivot[0] + dir[0] * barrelLen, pivot[1] + dir[1] * barrelLen, 0];
  const breech: [number, number, number] = [pivot[0] - dir[0] * 0.16, pivot[1] - dir[1] * 0.16, 0];
  frustum(P, I, breech, lens, 0.05, 0.085, 8, true, true); // tapered barrel, wide at the lens
  // Counterweight discs at the breech (flat brass rings).
  const wR = 0.1 * weight;
  for (let k = 0; k < 2; k++) {
    const off = 0.03 + k * 0.05 + (rng() - 0.5) * 0.012;
    const ca: [number, number, number] = [breech[0] - dir[0] * off, breech[1] - dir[1] * off, 0];
    const cb: [number, number, number] = [breech[0] - dir[0] * (off + 0.025), breech[1] - dir[1] * (off + 0.025), 0];
    frustum(P, I, ca, cb, wR, wR, 12, true, true);
  }
  dome(P, I, 0, 0, platformY + 0.02, 0.05, 4, 8); // little brass orrery node on the deck
  const brassEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.62), shade(C.color, 1.1));
  weatherRange(geo, 0, brassStart, rng, 0.09); // seeded per-facet weathering on the stone shaft
  paintRange(geo, brassStart, brassEnd, "#C9A24B", 0.9); // brass
  weatherRange(geo, brassStart, brassEnd, rng, 0.07); // tarnish variation on the brass instrument
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const observatoryDef: ArtifactDef = {
  type: "observatory",
  label: "Observatory Minaret",
  category: "buildings",
  output: "mesh",
  contract: "observatory",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "observatory",
  promptSeed:
    "low-poly hyper-tall Martian astronomical minaret, slender stone tower topped with a brass telescope on a yoke with circular counterweights, retro-futuristic, matte, stylized game asset.",
};
