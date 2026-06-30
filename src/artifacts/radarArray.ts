import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { tube, outQuad, paintRange, buildGeometry } from "../generation/primitives";
import { buildTurretBase } from "./turretBase";

const C = MESH_CONTRACTS.radarArray;
const HALF = C.footprint / 2; // 0.5
const H = C.height; // 0.76

const params = [
  { key: "housingShape", label: "Housing shape (round ↔ boxy)", kind: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
  { key: "panelWidth", label: "Panel width", kind: "number", min: 0.26, max: 0.38, step: 0.01, default: 0.32 },
  { key: "panelHeight", label: "Panel height", kind: "number", min: 0.16, max: 0.24, step: 0.01, default: 0.2 },
  { key: "elevation", label: "Panel elevation", kind: "number", min: 10, max: 55, step: 1, default: 25 },
  { key: "dipoleRows", label: "Dipole rows", kind: "int", min: 3, max: 8, step: 1, default: 5 },
  { key: "greebleDensity", label: "Greeble density", kind: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "armorColor", label: "Armor color", kind: "color", default: C.color },
  { key: "panelColor", label: "Array panel color", kind: "color", default: "#2E3133" },
] as const;

/**
 * A thin box built from three orthogonal direction vectors rather than world axes — used for
 * the array panel, which tilts in the dir/perp plane while staying fixed along lateral (Z).
 */
function tiltedBox(
  P: number[], I: number[],
  center: [number, number, number],
  dir: [number, number, number], perp: [number, number, number], lat: [number, number, number],
  halfDepth: number, halfHeight: number, halfWidth: number,
): void {
  const v = (d: number, h: number, w: number): number => {
    P.push(
      center[0] + dir[0] * d + perp[0] * h + lat[0] * w,
      center[1] + dir[1] * d + perp[1] * h + lat[1] * w,
      center[2] + dir[2] * d + perp[2] * h + lat[2] * w,
    );
    return P.length / 3 - 1;
  };
  const c000 = v(-halfDepth, -halfHeight, -halfWidth), c001 = v(-halfDepth, -halfHeight, halfWidth);
  const c010 = v(-halfDepth, halfHeight, -halfWidth), c011 = v(-halfDepth, halfHeight, halfWidth);
  const c100 = v(halfDepth, -halfHeight, -halfWidth), c101 = v(halfDepth, -halfHeight, halfWidth);
  const c110 = v(halfDepth, halfHeight, -halfWidth), c111 = v(halfDepth, halfHeight, halfWidth);
  const cx = center[0], cy = center[1], cz = center[2];
  outQuad(P, I, c100, c101, c111, c110, cx, cy, cz); // +depth (front)
  outQuad(P, I, c000, c010, c011, c001, cx, cy, cz); // -depth (back)
  outQuad(P, I, c000, c001, c101, c100, cx, cy, cz); // -height
  outQuad(P, I, c010, c110, c111, c011, cx, cy, cz); // +height
  outQuad(P, I, c000, c100, c110, c010, cx, cy, cz); // -width
  outQuad(P, I, c001, c011, c111, c101, cx, cy, cz); // +width
}

/**
 * Radar Array: the turret-family base (see turretBase.ts) topped by a flat panel antenna
 * carrying a grid of horizontal dipole bars (the classic "bedspring" early-warning look),
 * mounted on a single mast with a diagonal brace, tilted skyward. Like the dish, the tilt
 * happens entirely in the dir/perp plane while the panel's width stays fixed along local Z, so
 * the dipole grid always reads flush across the face regardless of elevation.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const housingShape = p.housingShape as number;
  const panelWidth = p.panelWidth as number;
  const panelHeight = p.panelHeight as number;
  const elevation = (p.elevation as number) * (Math.PI / 180);
  const dipoleRows = Math.max(3, Math.round(p.dipoleRows as number));
  const greebleDensity = p.greebleDensity as number;
  const armorColor = p.armorColor as string;
  const panelColor = p.panelColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const { topY, topR, trimStart, trimEnd } =
    buildTurretBase(P, I, rng, H, HALF, housingShape, greebleDensity, orn);

  // Mast + diagonal brace.
  const mastH = 0.09;
  const pivot: [number, number, number] = [0, topY + mastH, 0];
  const mastStart = I.length;
  tube(P, I, [0, topY, 0], pivot, topR * 0.1, 7, false, false);
  const dir: [number, number, number] = [Math.cos(elevation), Math.sin(elevation), 0];
  const perp: [number, number, number] = [-dir[1], dir[0], 0];
  const lat: [number, number, number] = [0, 0, 1];
  // Brace runs from a point on the roof out along the pointing direction up to the panel's
  // low back edge, so the panel reads as supported rather than balanced on a single pin.
  const panelCenter: [number, number, number] = [
    pivot[0] + dir[0] * 0.012, pivot[1] + dir[1] * 0.012, pivot[2],
  ];
  const braceTop: [number, number, number] = [
    panelCenter[0] - perp[0] * panelHeight * 0.4,
    panelCenter[1] - perp[1] * panelHeight * 0.4,
    panelCenter[2],
  ];
  tube(P, I, [dir[0] * topR * 0.55, topY, 0], braceTop, topR * 0.07, 5, true, false);
  const mastEnd = I.length;

  // Panel backing + dipole grid.
  const panelStart = I.length;
  tiltedBox(P, I, panelCenter, dir, perp, lat, 0.012, panelHeight / 2, panelWidth / 2);
  const barLen = panelWidth * 0.42;
  for (let r = 0; r < dipoleRows; r++) {
    const t = dipoleRows === 1 ? 0.5 : r / (dipoleRows - 1);
    const hOff = (t - 0.5) * panelHeight * 0.82;
    const base: [number, number, number] = [
      panelCenter[0] + dir[0] * 0.018 + perp[0] * hOff,
      panelCenter[1] + dir[1] * 0.018 + perp[1] * hOff,
      panelCenter[2],
    ];
    const a: [number, number, number] = [base[0] - lat[0] * barLen, base[1] - lat[1] * barLen, base[2] - lat[2] * barLen];
    const b: [number, number, number] = [base[0] + lat[0] * barLen, base[1] + lat[1] * barLen, base[2] + lat[2] * barLen];
    tube(P, I, a, b, 0.009, 5, true, true);
  }
  const panelEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(armorColor, 0.6), shade(armorColor, 1.12));
  weatherRange(geo, 0, mastStart, rng, 0.09); // seeded per-facet weathering on the hull + trim + greebles
  paintRange(geo, trimStart, trimEnd, "#3A3D40", 0.7); // trim band: darker steel
  paintRange(geo, mastStart, mastEnd, "#3A3D40", 0.8); // mast + brace: darker steel
  weatherRange(geo, mastStart, mastEnd, rng, 0.08);
  paintRange(geo, panelStart, panelEnd, panelColor, 0.92); // panel + dipole grid
  weatherRange(geo, panelStart, panelEnd, rng, 0.06);
  return { kind: "mesh", geometry: geo, color: armorColor };
}

export const radarArrayDef: ArtifactDef = {
  type: "radarArray",
  label: "Radar Array",
  category: "buildings",
  output: "mesh",
  contract: "radarArray",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "radar_array",
  promptSeed:
    "low-poly retro-futuristic Martian radar array station, a stepped armored tower on a flared pyramidal base covered in riveted armor-plate seams, vents and hatches, topped by a flat panel antenna with a grid of horizontal dipole bars on a braced mast tilted skyward, matte gunmetal steel and dark panel, stylized game asset.",
};
