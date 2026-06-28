import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamSpec, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyHeightBands } from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.mountain;

// One Mountain type; its look is driven by a base colour (foot) and a top colour
// (summit). "Color blend" controls how far up the base colour holds before fading to the
// top colour — 0 is a plain base→top gradient, high values keep the top colour near the
// peak only (a snow cap / snowline). Pick green→green for forest, grey→white for snow,
// dark brown→tan for bare rock, etc.
const params: ParamSpec[] = [
  { key: "radius", label: "Radius", kind: "number", min: 0.6, max: 1.0, step: 0.01, default: C.footprint / 2 },
  { key: "height", label: "Height", kind: "number", min: 0.6, max: 1.6, step: 0.01, default: C.height },
  { key: "sides", label: "Sides", kind: "int", min: 6, max: 14, step: 1, default: 9 },
  { key: "ridges", label: "Ridges", kind: "int", min: 2, max: 8, step: 1, default: 5 },
  { key: "ruggedness", label: "Ruggedness", kind: "number", min: 0, max: 0.6, step: 0.02, default: 0.3 },
  { key: "peak", label: "Peak sharpness", kind: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
  { key: "blend", label: "Color blend", kind: "number", min: 0, max: 0.9, step: 0.02, default: 0 },
  { key: "baseColor", label: "Base color", kind: "color", default: "#5a4632" },
  { key: "topColor", label: "Top color", kind: "color", default: "#9a7d52" },
];

/**
 * A peaked low-poly mountain: concentric rings narrowing to a single apex, with radial
 * ridge spurs and per-vertex jitter for a craggy silhouette. Faceted; base sits on Y = 0.
 */
function buildMountain(seed: number, p: ParamValues): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const radius = p.radius as number;
  const height = p.height as number;
  const sides = Math.max(3, Math.round(p.sides as number));
  const ridges = Math.max(1, Math.round(p.ridges as number));
  const rug = p.ruggedness as number;
  const peak = p.peak as number;
  const rings = 6;
  // Sharper peak → larger exponent → flatter skirt, pointier summit.
  const exp = 0.6 + peak * 1.8;
  const ridgePhase = rng() * Math.PI * 2;

  const positions: number[] = [];
  const indices: number[] = [];
  const grid: number[][] = [];

  for (let r = 0; r <= rings; r++) {
    const tr = r / rings; // 0 base → 1 summit
    grid.push([]);
    if (r === rings) {
      const h = height * (1 + (rng() - 0.5) * rug * 0.15);
      positions.push(0, h, 0);
      grid[r].push(positions.length / 3 - 1);
      continue;
    }
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const ridge = 1 + 0.14 * Math.cos(ridges * ang + ridgePhase);
      const rad = radius * (1 - tr) * ridge * (1 + (rng() - 0.5) * rug * 0.3);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      // Height climbs with the peak easing; ridges lift their crests, more so up high.
      const base = height * Math.pow(tr, exp);
      const ridgeH = 0.1 * height * Math.cos(ridges * ang + ridgePhase) * tr;
      const jit = (rng() - 0.5) * rug * height * 0.12 * tr;
      positions.push(x, Math.max(0, base + ridgeH + jit), z);
      grid[r].push(positions.length / 3 - 1);
    }
  }

  // Side quads between successive rings.
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const sn = (s + 1) % sides;
      const a = grid[r][s];
      const b = grid[r][sn];
      const c = grid[r + 1][sn];
      const d = grid[r + 1][s];
      indices.push(a, d, c, a, c, b);
    }
  }
  // Cap from the last full ring up to the apex.
  const apex = grid[rings][0];
  const lastRing = grid[rings - 1];
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    indices.push(lastRing[s], apex, lastRing[sn]);
  }
  // Bottom cap so the base is closed/manifold.
  const base = grid[0];
  for (let s = 1; s < sides - 1; s++) {
    indices.push(base[0], base[s + 1], base[s]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return facet(geo);
}

function generate(seed: number, p: ParamValues): GeneratedMesh {
  const geo = buildMountain(seed, p);
  const baseColor = p.baseColor as string;
  const topColor = p.topColor as string;
  const blend = Math.min(0.9, Math.max(0, p.blend as number));
  // base colour holds until `blend`, then ramps to the top colour by the summit.
  applyHeightBands(
    geo,
    [
      { t: 0, color: baseColor },
      { t: blend, color: baseColor },
      { t: 1, color: topColor },
    ],
    makeRng(seed ^ 0x9e3779b9),
    0.06,
  );
  return { kind: "mesh", geometry: geo, color: topColor };
}

export const mountainDef: ArtifactDef = {
  type: "mountain",
  label: "Mountain",
  category: "terrain",
  output: "mesh",
  contract: "mountain",
  params,
  generate,
  fileStem: "mountain",
  promptSeed:
    "low-poly stylized mountain, faceted ridges and peak, matte, engraved-illustration look, game asset.",
};
