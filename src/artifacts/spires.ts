import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.spires;
const HALF = C.footprint / 2;

const params = [
  { key: "height", label: "Height", kind: "number", min: 0.9, max: 2.0, step: 0.01, default: C.height },
  { key: "count", label: "Spire count", kind: "int", min: 1, max: 9, step: 1, default: 5 },
  { key: "facets", label: "Facet count", kind: "int", min: 3, max: 8, step: 1, default: 5 },
  { key: "tilt", label: "Tilt angle", kind: "number", min: 0, max: 0.5, step: 0.02, default: 0.12 },
  { key: "fracture", label: "Fracture frequency", kind: "number", min: 0, max: 1, step: 0.02, default: 0.35 },
  { key: "baseColor", label: "Base color", kind: "color", default: "#5b4a6e" },
  { key: "tipColor", label: "Tip color", kind: "color", default: "#c8b6e0" },
] as const;

/**
 * Crystalline spires: a cluster of sharp faceted mineral monoliths jutting straight up as
 * flight hazards. Facet count goes from blocky quartz (low) to smooth obelisks (high), tilt
 * leans them for overhead cover, and fracture frequency stacks jagged offset segments with
 * sharp horizontal splits. Each spire's base sits on Y = 0. Faceted, amethyst crystal.
 */
function buildCrystal(
  positions: number[],
  indices: number[],
  rng: () => number,
  ox: number,
  oz: number,
  sides: number,
  ht: number,
  r0: number,
  tilt: number,
  fracture: number,
): void {
  const segments = 2 + Math.round(fracture * 4); // 2..6 jagged splits
  const tiltDir = rng() * Math.PI * 2;
  const tdx = Math.cos(tiltDir) * tilt;
  const tdz = Math.sin(tiltDir) * tilt;
  const angOff = rng() * Math.PI * 2;

  const rings: number[][] = [];
  for (let r = 0; r < segments; r++) {
    const t = r / segments;
    const y = ht * t;
    const rad = r0 * (1 - 0.8 * t) * (1 + (rng() - 0.5) * fracture * 0.4);
    // Lateral fracture jitter offsets each course; tilt shears the whole spire.
    const jx = r === 0 ? 0 : (rng() - 0.5) * fracture * r0 * 0.5;
    const jz = r === 0 ? 0 : (rng() - 0.5) * fracture * r0 * 0.5;
    const cx = ox + tdx * y + jx;
    const cz = oz + tdz * y + jz;
    const twist = angOff + t * fracture * 1.2;
    const ring: number[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + twist;
      positions.push(cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad);
      ring.push(positions.length / 3 - 1);
    }
    rings.push(ring);
  }

  // Sharp apex.
  const ay = ht * (1 + (rng() - 0.5) * fracture * 0.1);
  positions.push(ox + tdx * ay, ay, oz + tdz * ay);
  const apex = positions.length / 3 - 1;

  // Side faces (outward), cap to apex, and closed base.
  for (let r = 0; r < segments - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const sn = (s + 1) % sides;
      const a = rings[r][s], d = rings[r + 1][s], c = rings[r + 1][sn], b = rings[r][sn];
      indices.push(a, d, c, a, c, b);
    }
  }
  const last = rings[segments - 1];
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    indices.push(last[s], apex, last[sn]);
  }
  const base = rings[0];
  for (let s = 1; s < sides - 1; s++) indices.push(base[0], base[s + 1], base[s]);
}

function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const height = p.height as number;
  const count = Math.max(1, Math.round(p.count as number));
  const sides = Math.max(3, Math.round(p.facets as number));
  const tilt = p.tilt as number;
  const fracture = p.fracture as number;

  const positions: number[] = [];
  const indices: number[] = [];

  // Tall central spire, then smaller ones evenly ringed toward the footprint edge so the
  // cluster reliably fills the hex (keeps the conformed footprint/height stable).
  buildCrystal(positions, indices, rng, 0, 0, sides, height, height * 0.22, tilt * 0.6, fracture);
  const angStart = rng() * Math.PI * 2;
  for (let i = 1; i < count; i++) {
    const ang = angStart + ((i - 1) / Math.max(1, count - 1)) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const rr = (0.62 + (rng() - 0.5) * 0.12) * HALF;
    const ox = Math.cos(ang) * rr;
    const oz = Math.sin(ang) * rr;
    const scale = 0.45 + rng() * 0.45;
    buildCrystal(positions, indices, rng, ox, oz, sides, height * scale, height * 0.22 * scale, tilt, fracture);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const faceted = facet(geo);
  const baseColor = p.baseColor as string;
  const tipColor = p.tipColor as string;
  applyVerticalGradient(faceted, shade(baseColor, 0.85), tipColor);
  return { kind: "mesh", geometry: faceted, color: tipColor };
}

export const spiresDef: ArtifactDef = {
  type: "spires",
  label: "Crystal Spires",
  category: "terrain",
  output: "mesh",
  contract: "spires",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "spires",
  promptSeed:
    "low-poly stylized crystalline mineral spires, sharp jagged faceted monoliths jutting up, amethyst quartz, matte with slight sheen, engraved-illustration look, game asset.",
};
