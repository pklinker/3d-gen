import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  outQuad, tube, frustum, ring, paintWhere, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.mooringSpire;
const HALF = C.footprint / 2; // 0.4
const H = C.height; // 2.0

const params = [
  { key: "fins", label: "Spire fin count", kind: "int", min: 3, max: 6, step: 1, default: 4 },
  { key: "grapple", label: "Grapple ring radius", kind: "number", min: 0.1, max: 0.3, step: 0.01, default: 0.2 },
  { key: "glow", label: "Glow segment height", kind: "number", min: 0.15, max: 0.7, step: 0.02, default: 0.4 },
  { key: "taper", label: "Shaft taper", kind: "number", min: 0, max: 0.7, step: 0.02, default: 0.5 },
  { key: "glowColor", label: "Radium glow", kind: "color", default: "#8CFFB4" },
] as const;

/**
 * A single radial fin/buttress wing: a thin blade in the plane of `ang`, running from the
 * shaft surface outward, swept so it flares wide at the foot (rOut0) and tucks back in near
 * the top (rOut1). Eight corners, six outward quads — gives the spire its art-deco wings and
 * (at the foot) defines the footprint.
 */
function fin(
  P: number[], I: number[],
  ang: number, rIn: number, rOut0: number, rOut1: number, y0: number, y1: number, w: number,
): void {
  const dx = Math.cos(ang), dz = Math.sin(ang); // radial
  const tx = -dz, tz = dx; // tangential
  const corner = (r: number, y: number, s: number): number => {
    P.push(dx * r + tx * (w / 2) * s, y, dz * r + tz * (w / 2) * s);
    return P.length / 3 - 1;
  };
  // inner stays on the shaft, outer sweeps in with height
  const bi0 = corner(rIn, y0, -1), bi1 = corner(rIn, y0, 1);
  const bo0 = corner(rOut0, y0, -1), bo1 = corner(rOut0, y0, 1);
  const ti0 = corner(rIn, y1, -1), ti1 = corner(rIn, y1, 1);
  const to0 = corner(rOut1, y1, -1), to1 = corner(rOut1, y1, 1);
  const cx = dx * (rIn + rOut0) / 2, cy = (y0 + y1) / 2, cz = dz * (rIn + rOut0) / 2;
  outQuad(P, I, bo0, bo1, to1, to0, cx, cy, cz); // outer face
  outQuad(P, I, bi0, ti0, ti1, bi1, cx, cy, cz); // inner face
  outQuad(P, I, bo0, to0, ti0, bi0, cx, cy, cz); // side -
  outQuad(P, I, bo1, bi1, ti1, to1, cx, cy, cz); // side +
  outQuad(P, I, bo0, bi0, bi1, bo1, cx, cy, cz); // bottom
  outQuad(P, I, to0, to1, ti1, ti0, cx, cy, cz); // top
}

/**
 * Radium Mooring Spire: a slender, art-deco tower for anchoring scouting flyers. A tapering
 * twelve-sided shaft rises through a glowing radium emitter drum to a thin mast crowned by a
 * circular grapple ring (struts tie it to the mast). Three-to-six swept fins flare from the
 * foot — both decoration and the piece's footprint. The emitter band is repainted to a bright
 * radium tint over the baked steel gradient. Pale anodized steel.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const finCount = Math.max(3, Math.round(p.fins as number));
  const grappleR = p.grapple as number;
  const glowH = p.glow as number;
  const taper = p.taper as number;
  const glowColor = p.glowColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const shaftTopY = H * 0.78;
  const baseR = 0.17;
  const topR = baseR * (1 - taper);
  const rAt = (y: number) => baseR + (topR - baseR) * Math.min(1, y / shaftTopY);

  const glowCenter = shaftTopY * 0.48;
  const glowY0 = Math.max(0.1, glowCenter - glowH / 2);
  const glowY1 = Math.min(shaftTopY - 0.05, glowCenter + glowH / 2);
  const sides = 12;

  // Shaft below glow, the bulged emitter drum, and the shaft above glow.
  frustum(P, I, [0, 0, 0], [0, glowY0, 0], baseR, rAt(glowY0), sides, true, false);
  frustum(P, I, [0, glowY0, 0], [0, glowY1, 0], rAt(glowY0) * 1.14, rAt(glowY1) * 1.14, sides, false, false);
  frustum(P, I, [0, glowY1, 0], [0, shaftTopY, 0], rAt(glowY1), topR, sides, false, true);

  // Mast and grapple ring with three tie struts.
  const mastTop = H;
  tube(P, I, [0, shaftTopY, 0], [0, mastTop, 0], topR * 0.45, 6, false, true);
  const ringY = shaftTopY + (mastTop - shaftTopY) * 0.55;
  ring(P, I, 0, ringY, 0, grappleR, 0.028, 16, 6);
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2;
    tube(P, I, [0, ringY, 0], [Math.cos(a) * grappleR, ringY, Math.sin(a) * grappleR], 0.014, 4, false, false);
  }

  // Fins: flare from the shaft to the footprint edge at the foot.
  for (let i = 0; i < finCount; i++) {
    const ang = (i / finCount) * Math.PI * 2 + rng() * 0.05;
    fin(P, I, ang, baseR * 0.85, HALF, rAt(glowY0) * 1.25, 0, glowY0, 0.045);
  }

  // Ornamentation: stacked cornice rings banding the shaft, scaled by the global slider.
  if (orn > 0.05) {
    const tubeR = 0.018 + 0.03 * orn;
    ring(P, I, 0, glowY1 + 0.04, 0, rAt(glowY1) * 1.18, tubeR, 14, 5);
    ring(P, I, 0, shaftTopY - 0.04, 0, topR * 1.25, tubeR * 0.8, 12, 5);
    if (orn > 0.5) ring(P, I, 0, glowY0 - 0.04, 0, rAt(glowY0) * 1.18, tubeR, 14, 5);
  }

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.6), shade(C.color, 1.15));
  // Repaint the emitter band a bright radium tint (shaft only — exclude fins/rings).
  paintWhere(geo, (x, y, z) => y >= glowY0 && y <= glowY1 && Math.hypot(x, z) < rAt(glowCenter) * 1.5, glowColor, 0.9);
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const mooringSpireDef: ArtifactDef = {
  type: "mooringSpire",
  label: "Radium Mooring Spire",
  category: "buildings",
  output: "mesh",
  contract: "mooringSpire",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "mooring_spire",
  promptSeed:
    "low-poly art-deco Martian mooring spire, slender anodized-steel tower with vertical fins, a glowing radium emitter band and a circular grapple ring on top, retro-futuristic, matte, stylized game asset.",
};
