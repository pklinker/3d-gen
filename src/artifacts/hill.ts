import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import {
  makeRng,
  applyVerticalGradient,
  facet,
  shade,
} from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.hill;

const params = [
  { key: "radius", label: "Radius", kind: "number", min: 0.5, max: 1.2, step: 0.01, default: C.footprint / 2 },
  { key: "height", label: "Height", kind: "number", min: 0.2, max: 1.0, step: 0.01, default: C.height },
  { key: "sides", label: "Sides", kind: "int", min: 5, max: 12, step: 1, default: 7 },
  { key: "rings", label: "Rings", kind: "int", min: 2, max: 6, step: 1, default: 3 },
  { key: "flatTop", label: "Top flatness", kind: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
  { key: "jitter", label: "Edge jitter", kind: "number", min: 0, max: 0.3, step: 0.01, default: 0.12 },
] as const;

/**
 * Low-poly mesa/hill: concentric rings raised toward the center with a
 * flattenable top and jittered silhouette. Faceted, vertex-colored ochre.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const radius = p.radius as number;
  const height = p.height as number;
  const sides = Math.max(3, Math.round(p.sides as number));
  const rings = Math.max(1, Math.round(p.rings as number));
  const flatTop = p.flatTop as number;
  const jitter = p.jitter as number;

  const positions: number[] = [];
  const indices: number[] = [];

  // Build ring vertices from outer (ring 0, y=0) to center apex.
  // ringRadius[r], ringHeight[r]; last ring is a single apex/top cap.
  const ringCount = rings + 1;
  const grid: number[][] = []; // grid[r][s] = vertex index
  // per-corner random angle offset for an irregular but stable silhouette
  const angleJit: number[] = [];
  for (let s = 0; s < sides; s++) angleJit.push((rng() - 0.5) * jitter);

  for (let r = 0; r < ringCount; r++) {
    const tr = r / rings; // 0..1 outward->inward
    // radius shrinks inward; height rises with an ease so the top can flatten
    const rad = radius * (1 - tr);
    // height profile: ease toward flat top by mixing linear and a plateau
    const rise = Math.pow(tr, 1 - flatTop * 0.8);
    const baseH = height * rise;
    grid.push([]);
    if (r === ringCount - 1) {
      // apex / flat top center
      const topH = height + (rng() - 0.5) * jitter * height * 0.3;
      positions.push(0, topH, 0);
      grid[r].push(positions.length / 3 - 1);
      continue;
    }
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2 + angleJit[s];
      const jr = rad * (1 + (rng() - 0.5) * jitter);
      const x = Math.cos(ang) * jr;
      const z = Math.sin(ang) * jr;
      const h = baseH + (r === 0 ? 0 : (rng() - 0.5) * jitter * height * 0.5);
      positions.push(x, Math.max(0, h), z);
      grid[r].push(positions.length / 3 - 1);
    }
  }

  // Side quads between successive rings (except the apex ring).
  for (let r = 0; r < ringCount - 2; r++) {
    for (let s = 0; s < sides; s++) {
      const sn = (s + 1) % sides;
      const a = grid[r][s];
      const b = grid[r][sn];
      const c = grid[r + 1][sn];
      const d = grid[r + 1][s];
      indices.push(a, d, c, a, c, b);
    }
  }
  // Cap triangles from last full ring to apex.
  const apex = grid[ringCount - 1][0];
  const lastRing = grid[ringCount - 2];
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    indices.push(lastRing[s], apex, lastRing[sn]);
  }
  // Bottom cap (fan) so it's manifold/closed at the base.
  const base = grid[0];
  for (let s = 1; s < sides - 1; s++) {
    indices.push(base[0], base[s + 1], base[s]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const faceted = facet(geo);
  applyVerticalGradient(faceted, shade(C.color, 0.7), C.color);
  return { kind: "mesh", geometry: faceted, color: C.color };
}

export const hillDef: ArtifactDef = {
  type: "hill",
  label: "Hill / Mesa",
  category: "terrain",
  output: "mesh",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "hill",
  promptSeed:
    "low-poly stylized Martian rocky mesa / dry-lakebed hill, weathered ochre sandstone, flat-topped, matte, engraved-illustration look, game asset.",
};
