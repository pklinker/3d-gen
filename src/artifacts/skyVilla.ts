import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  tube, frustum, ring, dome, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.skyVilla;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 1.9

const params = [
  { key: "tiers", label: "Balcony tiers", kind: "int", min: 2, max: 5, step: 1, default: 3 },
  { key: "cant", label: "Cantilever cant", kind: "number", min: 0, max: 0.4, step: 0.02, default: 0.24 },
  { key: "awning", label: "Awning curve", kind: "number", min: 0, max: 1, step: 0.05, default: 0.55 },
  { key: "awningColor", label: "Awning tint", kind: "color", default: "#C25B3A" },
] as const;

/**
 * Aristocrat's Sky-Villa / Spire-Palace: a deliberately top-heavy residential tower. A slender
 * central column carries a stack of open balcony platforms that grow wider with height — the
 * cantilever slider drives how dramatically the upper floors overhang the narrow base. Thin
 * columns tie the tiers; railings ring each deck; sail-like parasol awnings sweep over the
 * balconies (their droop set by the awning-curve slider) in a warm fabric tint. Ivory plaster.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const tiers = Math.max(2, Math.round(p.tiers as number));
  const cant = p.cant as number;
  const awning = p.awning as number;
  const awningColor = p.awningColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  // Central column.
  const colTop = H * 0.92;
  frustum(P, I, [0, 0, 0], [0, colTop, 0], 0.13, 0.08, 9, true, false);

  const firstY = 0.42;
  const lastY = H * 0.84;
  const topR = HALF * 0.95;
  const botR = Math.max(0.1, topR - cant);
  const yAt = (k: number) => (tiers === 1 ? lastY : firstY + (lastY - firstY) * (k / (tiers - 1)));
  const rAt = (k: number) => (tiers === 1 ? topR : botR + (topR - botR) * (k / (tiers - 1)));

  // Decks, railings and tie-columns (stone palette).
  for (let k = 0; k < tiers; k++) {
    const y = yAt(k);
    const r = rAt(k);
    frustum(P, I, [0, y - 0.03, 0], [0, y + 0.03, 0], r, r, 10, true, true);
    ring(P, I, 0, y + 0.07, 0, r * 0.97, 0.018, 14, 4);
    if (k > 0) {
      const yb = yAt(k - 1), rb = rAt(k - 1);
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + 0.4;
        tube(P, I,
          [Math.cos(a) * rb * 0.9, yb + 0.03, Math.sin(a) * rb * 0.9],
          [Math.cos(a) * r * 0.9, y - 0.03, Math.sin(a) * r * 0.9],
          0.02, 4, false, false);
      }
    }
  }

  // Parasol awnings over each deck: cones whose rims droop with the awning slider. Built in
  // one contiguous block so the warm fabric tint paints exactly these and nothing else.
  const awnStart = I.length;
  for (let k = 0; k < tiers; k++) {
    const y = yAt(k), r = rAt(k);
    const apexY = y + 0.26;
    const rimY = apexY - (0.05 + awning * 0.2);
    frustum(P, I, [0, apexY, 0], [0, rimY, 0], 0.03, r * 1.08, 12, false, false);
  }
  const awnEnd = I.length;

  // Roof finial.
  dome(P, I, 0, 0, colTop, 0.09, 4, 8);
  tube(P, I, [0, colTop + 0.06, 0], [0, H, 0], 0.02, 5, false, true);

  // Ornament: cornice lips under each balcony deck.
  if (orn > 0.05) {
    for (let k = 0; k < tiers; k++) {
      const y = yAt(k), r = rAt(k);
      frustum(P, I, [0, y - 0.06, 0], [0, y - 0.03, 0], r * (1.02 + 0.05 * orn), r, 10, false, false);
    }
  }

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.66), shade(C.color, 1.1));
  paintRange(geo, awnStart, awnEnd, awningColor, 0.85); // parasol awnings: warm fabric
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const skyVillaDef: ArtifactDef = {
  type: "skyVilla",
  label: "Sky-Villa",
  category: "buildings",
  output: "mesh",
  contract: "skyVilla",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "sky_villa",
  promptSeed:
    "low-poly top-heavy Martian aristocrat sky-villa, slender base with wide cantilevered open balcony tiers, thin columns and sweeping sail awnings, retro-futuristic art-deco, matte, stylized game asset.",
};
