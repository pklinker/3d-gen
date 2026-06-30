import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { frustum, tube, paintRange, buildGeometry } from "../generation/primitives";
import { buildTurretBase } from "./turretBase";

const C = MESH_CONTRACTS.aaTurret;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 0.65

const params = [
  { key: "housingShape", label: "Housing shape (round ↔ boxy)", kind: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
  { key: "barrels", label: "Barrel count", kind: "int", min: 1, max: 4, step: 1, default: 2 },
  { key: "elevation", label: "Barrel elevation", kind: "number", min: 20, max: 70, step: 1, default: 38 },
  { key: "barrelLength", label: "Barrel length", kind: "number", min: 0.14, max: 0.22, step: 0.01, default: 0.18 },
  { key: "greebleDensity", label: "Greeble density", kind: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "armorColor", label: "Armor color", kind: "color", default: C.color },
  { key: "barrelColor", label: "Barrel steel", kind: "color", default: "#3A3D40" },
] as const;

/**
 * Anti-Aircraft Turret: the shared turret-family base (see turretBase.ts) — a stepped armored
 * tower on a flared pyramidal base, fully enclosed — topped by an exposed turntable carrying a
 * tight cluster of barrels on a yoke, elevated skyward. Gunmetal steel, seeded weathering.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const housingShape = p.housingShape as number;
  const barrelCount = Math.max(1, Math.round(p.barrels as number));
  const elevation = (p.elevation as number) * (Math.PI / 180);
  const barrelLength = p.barrelLength as number;
  const greebleDensity = p.greebleDensity as number;
  const armorColor = p.armorColor as string;
  const barrelColor = p.barrelColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const { topY, topR, sides, trimStart, trimEnd } =
    buildTurretBase(P, I, rng, H, HALF, housingShape, greebleDensity, orn);

  // Exposed turntable + barrel cluster on the flat roof — unlike the rest of the tower
  // (fully sealed: every tier above caps the one before it) the gun mount itself is open,
  // matching a traversable yoke sitting on top of the armored housing.
  const turntableR = topR * 0.58;
  const turntableH = 0.035;
  const gunStart = I.length;
  frustum(P, I, [0, topY, 0], [0, topY + turntableH, 0], turntableR, turntableR * 0.96, Math.max(8, sides), false, true);
  const gunY = topY + turntableH;
  const gap = 0.05; // barrels mounted close together (but not fused — breech radius is 0.022)
  const dir: [number, number] = [Math.cos(elevation), Math.sin(elevation)];
  // Yoke crossbar tying the barrels together at the breech.
  if (barrelCount > 1) {
    const half = ((barrelCount - 1) / 2) * gap + 0.02;
    tube(P, I, [0, gunY + 0.018, -half], [0, gunY + 0.018, half], 0.012, 5, true, true);
  }
  for (let i = 0; i < barrelCount; i++) {
    const lateral = (i - (barrelCount - 1) / 2) * gap;
    const breech: [number, number, number] = [0, gunY + 0.02, lateral];
    const muzzle: [number, number, number] = [dir[0] * barrelLength, gunY + 0.02 + dir[1] * barrelLength, lateral];
    frustum(P, I, breech, muzzle, 0.022, 0.013, 8, true, true);
  }
  const gunEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(armorColor, 0.6), shade(armorColor, 1.12));
  weatherRange(geo, 0, gunStart, rng, 0.09); // seeded per-facet weathering on the hull + trim + greebles
  paintRange(geo, trimStart, trimEnd, "#3A3D40", 0.7); // trim band: darker steel
  paintRange(geo, gunStart, gunEnd, barrelColor, 0.9); // turntable + yoke + barrels
  weatherRange(geo, gunStart, gunEnd, rng, 0.08); // scuffing on the gun steel
  return { kind: "mesh", geometry: geo, color: armorColor };
}

export const aaTurretDef: ArtifactDef = {
  type: "aaTurret",
  label: "AA Turret",
  category: "buildings",
  output: "mesh",
  contract: "aaTurret",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "aa_turret",
  promptSeed:
    "low-poly retro-futuristic Martian anti-aircraft turret, a stepped armored tower on a flared pyramidal base covered in riveted armor-plate seams, vents, hatches and portholes, topped by an exposed turntable with a tight cluster of cannon barrels on a yoke elevated skyward, matte gunmetal steel, stylized game asset.",
};
