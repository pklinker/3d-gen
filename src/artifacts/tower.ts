import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import {
  makeRng,
  applyVerticalGradient,
  facet,
  shade,
} from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.tower;

const params = [
  { key: "radius", label: "Base radius", kind: "number", min: 0.2, max: 0.6, step: 0.01, default: C.footprint / 2 },
  { key: "height", label: "Height", kind: "number", min: 0.8, max: 2.0, step: 0.01, default: C.height },
  { key: "sides", label: "Sides", kind: "int", min: 4, max: 10, step: 1, default: 6 },
  { key: "segments", label: "Segments", kind: "int", min: 4, max: 12, step: 1, default: 8 },
  { key: "taper", label: "Taper", kind: "number", min: 0, max: 0.6, step: 0.01, default: 0.25 },
  { key: "break", label: "Broken top", kind: "number", min: 0.1, max: 0.6, step: 0.02, default: 0.3 },
  { key: "lean", label: "Lean", kind: "number", min: 0, max: 0.15, step: 0.01, default: 0.03 },
] as const;

/**
 * Low-poly ruined watchtower spire: tapering prism whose top segments are
 * cropped into a jagged broken rim, with a slight lean. Faceted, pale marble.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const radius = p.radius as number;
  const height = p.height as number;
  const sides = Math.max(3, Math.round(p.sides as number));
  const segments = Math.max(2, Math.round(p.segments as number));
  const taper = p.taper as number;
  const breakFrac = p.break as number;
  const lean = p.lean as number;

  // Per-corner "broken" height: top rim is uneven. Corners below their break
  // height get walls; above, they are cropped (battlement-like ruin).
  const breakStart = 1 - breakFrac;
  const cornerTop: number[] = [];
  for (let s = 0; s < sides; s++) {
    cornerTop.push(breakStart + rng() * breakFrac);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const leanDir = rng() * Math.PI * 2;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;

  // grid[seg][s] vertex index (may be -1 if cropped above corner top)
  const grid: number[][] = [];
  for (let seg = 0; seg <= segments; seg++) {
    const t = seg / segments;
    const rad = radius * (1 - taper * t) * (1 + (rng() - 0.5) * 0.05);
    const y = height * t;
    grid.push([]);
    for (let s = 0; s < sides; s++) {
      if (t > cornerTop[s] + 1e-6) {
        grid[seg].push(-1);
        continue;
      }
      const ang = (s / sides) * Math.PI * 2;
      const x = Math.cos(ang) * rad + lx * y;
      const z = Math.sin(ang) * rad + lz * y;
      positions.push(x, y, z);
      grid[seg].push(positions.length / 3 - 1);
    }
  }

  // Side quads where both segment levels exist for an edge.
  for (let seg = 0; seg < segments; seg++) {
    for (let s = 0; s < sides; s++) {
      const sn = (s + 1) % sides;
      const a = grid[seg][s];
      const b = grid[seg][sn];
      const c = grid[seg + 1][sn];
      const d = grid[seg + 1][s];
      if (a < 0 || b < 0) continue;
      if (c >= 0 && d >= 0) {
        indices.push(a, d, c, a, c, b);
      } else if (d >= 0) {
        indices.push(a, d, b);
      } else if (c >= 0) {
        indices.push(a, c, b);
      }
    }
  }

  // Bottom cap (closed base).
  const base = grid[0];
  for (let s = 1; s < sides - 1; s++) {
    indices.push(base[0], base[s + 1], base[s]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const faceted = facet(geo);
  applyVerticalGradient(faceted, shade(C.color, 0.75), C.color);
  return { kind: "mesh", geometry: faceted, color: C.color };
}

export const towerDef: ArtifactDef = {
  type: "tower",
  label: "Ruined Tower",
  category: "buildings",
  output: "mesh",
  contract: "tower",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "tower",
  promptSeed:
    "low-poly ruined ancient Martian watchtower spire, broken weathered pale marble, slender, crumbling top, matte, stylized game asset.",
};
