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
  { key: "sides", label: "Sides", kind: "int", min: 6, max: 16, step: 1, default: 12 },
  { key: "segments", label: "Courses", kind: "int", min: 4, max: 16, step: 1, default: 10 },
  { key: "taper", label: "Taper", kind: "number", min: 0, max: 0.6, step: 0.01, default: 0.28 },
  { key: "break", label: "Broken top", kind: "number", min: 0.1, max: 0.6, step: 0.02, default: 0.3 },
  { key: "course", label: "Stone relief", kind: "number", min: 0, max: 0.08, step: 0.005, default: 0.025 },
  { key: "wall", label: "Wall thickness", kind: "number", min: 0.08, max: 0.4, step: 0.02, default: 0.2 },
  { key: "blockJitter", label: "Block variation", kind: "number", min: 0, max: 0.4, step: 0.02, default: 0.18 },
  { key: "lean", label: "Lean", kind: "number", min: 0, max: 0.15, step: 0.01, default: 0.03 },
] as const;

const fract = (x: number) => x - Math.floor(x);
/** Deterministic 0..1 hash of two integers — used to give each stone block its own tone. */
const hash2 = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

/**
 * Low-poly ruined watchtower: a hollow tapering polygonal shell of stacked stone
 * courses. It has real wall thickness — an outer wall, an inner wall, a capped
 * top edge and an interior floor — so the broken crown reads as a torn battlement
 * and you never see straight through it. Each side column rises to its own height
 * for an uneven ruin; courses step in and out for relief and each block is tinted
 * slightly differently so the wall reads as stacked masonry. Faceted, pale stone.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const radius = p.radius as number;
  const height = p.height as number;
  const sides = Math.max(3, Math.round(p.sides as number));
  const segments = Math.max(2, Math.round(p.segments as number));
  const taper = p.taper as number;
  const breakFrac = p.break as number;
  const courseDepth = p.course as number;
  const wallFrac = p.wall as number;
  const blockJitter = p.blockJitter as number;
  const lean = p.lean as number;

  // Per-side "broken" top height as a fraction of full height. Built from a couple
  // of low-frequency waves (plus a little jitter) so neighbouring sides have similar
  // heights — a continuous torn rim with one or two high lobes, not alternating horns.
  const breakStart = 1 - breakFrac;
  const phase = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  let cornerTop: number[] = [];
  for (let s = 0; s < sides; s++) {
    const ang = (s / sides) * Math.PI * 2;
    let n = (0.5 + 0.5 * Math.sin(ang + phase)) * 0.6 + (0.5 + 0.5 * Math.sin(2 * ang + phase2)) * 0.4;
    n = Math.min(1, Math.max(0, n + (rng() - 0.5) * 0.15));
    cornerTop.push(breakStart + n * breakFrac);
  }
  // Smooth the crown across neighbours so it reads as a torn wall rather than
  // single-column horns (a tall column flanked by short ones pinches into a spike).
  for (let pass = 0; pass < 2; pass++) {
    cornerTop = cornerTop.map((_, s) => {
      const prev = cornerTop[(s - 1 + sides) % sides];
      const next = cornerTop[(s + 1) % sides];
      return cornerTop[s] * 0.5 + (prev + next) * 0.25;
    });
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const leanDir = rng() * Math.PI * 2;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;

  // outer[s][r] / inner[s][r] vertex indices. Each column is subdivided into `segments`
  // courses up to that side's own broken-top height, so rows line up across columns for
  // clean quads. The inner ring sits one wall-thickness inboard, concentric with outer.
  const wall = Math.min(radius * 0.8, radius * wallFrac);
  const outer: number[][] = [];
  const inner: number[][] = [];
  for (let s = 0; s < sides; s++) {
    const ang = (s / sides) * Math.PI * 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const topH = height * cornerTop[s];
    outer.push([]);
    inner.push([]);
    for (let r = 0; r <= segments; r++) {
      const t = r / segments;
      const y = topH * t;
      const tGlobal = y / height; // taper by absolute height so columns stay consistent
      // Alternate courses in/out for masonry relief.
      const courseStep = 1 + (r % 2 === 0 ? -1 : 1) * courseDepth;
      const radO = radius * (1 - taper * tGlobal) * courseStep * (1 + (rng() - 0.5) * 0.03);
      const radI = Math.max(0.02, radO - wall);
      positions.push(cos * radO + lx * y, y, sin * radO + lz * y);
      outer[s].push(positions.length / 3 - 1);
      positions.push(cos * radI + lx * y, y, sin * radI + lz * y);
      inner[s].push(positions.length / 3 - 1);
    }
  }

  // Outer wall (faces out) and inner wall (faces in, reversed winding).
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    for (let r = 0; r < segments; r++) {
      const ao = outer[s][r], doo = outer[s][r + 1], co = outer[sn][r + 1], bo = outer[sn][r];
      indices.push(ao, doo, co, ao, co, bo);
      const ai = inner[s][r], di = inner[s][r + 1], ci = inner[sn][r + 1], bi = inner[sn][r];
      indices.push(ai, ci, di, ai, bi, ci);
    }
  }

  // Top edge: cap the wall thickness along the torn crown (faces up/outward).
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    const oS = outer[s][segments], iS = inner[s][segments];
    const oN = outer[sn][segments], iN = inner[sn][segments];
    indices.push(oS, iS, iN, oS, iN, oN);
  }

  // Bottom: underside disk (faces down) plus an interior floor (faces up) so the
  // shaft is closed — no see-through, no z-fighting.
  for (let s = 1; s < sides - 1; s++) {
    indices.push(outer[0][0], outer[s + 1][0], outer[s][0]);
    indices.push(inner[0][0], inner[s][0], inner[s + 1][0]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const faceted = facet(geo);
  applyVerticalGradient(faceted, shade(C.color, 0.7), C.color);
  paintBlocks(faceted, sides, segments, blockJitter);
  return { kind: "mesh", geometry: faceted, color: C.color };
}

/**
 * Tint the existing vertex-gradient colors per stone block: each face is bucketed by
 * its centroid's angle (column) and height (course), and multiplied by a deterministic
 * per-block brightness so the masonry reads as individually-laid blocks.
 */
function paintBlocks(
  geo: THREE.BufferGeometry,
  sides: number,
  segments: number,
  jitter: number,
): void {
  if (jitter <= 0) return;
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color") as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  const range = (geo.boundingBox!.max.y || 1) - minY || 1;
  const faces = pos.count / 3;
  const TAU = Math.PI * 2;
  for (let f = 0; f < faces; f++) {
    let xc = 0, yc = 0, zc = 0;
    for (let k = 0; k < 3; k++) {
      xc += pos.getX(f * 3 + k);
      yc += pos.getY(f * 3 + k);
      zc += pos.getZ(f * 3 + k);
    }
    xc /= 3; yc /= 3; zc /= 3;
    const ang = Math.atan2(zc, xc);
    const sIdx = Math.floor(fract(ang / TAU + 1) * sides);
    const rIdx = Math.floor(((yc - minY) / range) * segments);
    // Offset alternate courses so blocks stagger like real coursed masonry.
    const stagger = rIdx % 2 === 0 ? sIdx : sIdx + 0.5;
    const bright = 1 + (hash2(Math.round(stagger * 2), rIdx) - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      col.setXYZ(i, col.getX(i) * bright, col.getY(i) * bright, col.getZ(i) * bright);
    }
  }
  col.needsUpdate = true;
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
