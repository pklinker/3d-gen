import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import {
  makeRng,
  facet,
  heightfieldSolid,
  applyVerticalGradient,
  shade,
} from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.rift;
const HALF = C.footprint / 2;

const params = [
  { key: "depth", label: "Depth", kind: "number", min: 0.2, max: 0.7, step: 0.01, default: C.height },
  { key: "width", label: "Width", kind: "number", min: 0.15, max: 0.7, step: 0.01, default: 0.35 },
  { key: "sinuosity", label: "Zigzag / sinuosity", kind: "number", min: 0, max: 1, step: 0.02, default: 0.4 },
  { key: "steepness", label: "Bank steepness", kind: "number", min: 0, max: 1, step: 0.02, default: 0.6 },
  { key: "cracks", label: "Cracked bottom", kind: "number", min: 0, max: 1, step: 0.02, default: 0.4 },
  { key: "hexBase", label: "Hex base", kind: "bool", default: false },
  { key: "baseColor", label: "Floor color", kind: "color", default: "#4a3517" },
  { key: "topColor", label: "Rim color", kind: "color", default: "#8a652f" },
] as const;

/** smoothstep 0..1 */
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Dead-sea-bottom rift: a winding canyon carved into a ground slab. The trench floor sits
 * on Y = 0 and the surrounding plateau rises to the canyon depth, so flyers can dive in for
 * cover. The channel meanders across the hex (sinuosity), banks ramp from sheer to sloped
 * (steepness), and the floor carries low-poly crack relief. Faceted, ochre seabed rock.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const depth = p.depth as number;
  const halfWidth = (p.width as number) / 2;
  const sinuosity = p.sinuosity as number;
  const steepness = p.steepness as number;
  const cracks = p.cracks as number;

  // Meander the centerline in X as a function of Z, with two octaves for organic wander.
  const ph1 = rng() * Math.PI * 2;
  const ph2 = rng() * Math.PI * 2;
  const ampMax = HALF * 0.55;
  const centerX = (z: number) => {
    const u = (z / HALF) * Math.PI;
    return sinuosity * ampMax * (Math.sin(u * 1.3 + ph1) * 0.65 + Math.sin(u * 2.7 + ph2) * 0.35);
  };

  // Bank ramp width: steeper -> narrower transition (sheer cliffs).
  const bank = HALF * (0.55 - 0.45 * steepness);
  // Hashed per-cell crack jitter so the floor reads as fractured polygons.
  const fract = (x: number) => x - Math.floor(x);
  const crackAt = (x: number, z: number) => {
    if (cracks <= 0) return 0;
    const c = fract(Math.sin(Math.round(x * 26) * 12.9898 + Math.round(z * 26) * 78.233) * 43758.5453);
    return (c - 0.5) * cracks * depth * 0.28;
  };

  const h = (x: number, z: number) => {
    const dist = Math.abs(x - centerX(z));
    if (dist <= halfWidth) {
      // Trench floor with crack relief (kept just above 0 so the base stays flush).
      return Math.max(0, crackAt(x, z) + cracks * depth * 0.14);
    }
    const t = smooth((dist - halfWidth) / (bank + 1e-4));
    return depth * t;
  };

  const shape = (p.hexBase as boolean) ? "hex" : "square";
  const geo = facet(heightfieldSolid(42, HALF, h, shape));
  const baseColor = p.baseColor as string;
  const topColor = p.topColor as string;
  applyVerticalGradient(geo, shade(baseColor, 0.85), topColor);
  return { kind: "mesh", geometry: geo, color: topColor };
}

export const riftDef: ArtifactDef = {
  type: "rift",
  label: "Rift / Canyon",
  category: "terrain",
  output: "mesh",
  contract: "rift",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "rift",
  promptSeed:
    "low-poly stylized Martian dead-sea-bottom canyon rift, winding eroded trench with sheer ochre rock banks and cracked floor, matte, engraved-illustration look, game asset.",
};
