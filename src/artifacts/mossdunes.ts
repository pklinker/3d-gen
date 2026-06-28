import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import {
  makeRng,
  facet,
  heightfieldSolid,
  applyHeightBands,
} from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.mossdunes;
const HALF = C.footprint / 2;

const params = [
  { key: "height", label: "Dune height", kind: "number", min: 0.15, max: 0.6, step: 0.01, default: C.height },
  { key: "frequency", label: "Wave frequency", kind: "int", min: 2, max: 9, step: 1, default: 4 },
  { key: "crest", label: "Crest sharpness", kind: "number", min: 0, max: 1, step: 0.02, default: 0.5 },
  { key: "overgrowth", label: "Overgrowth density", kind: "int", min: 0, max: 60, step: 1, default: 24 },
  { key: "hexBase", label: "Hex base", kind: "bool", default: false },
  { key: "mossColor", label: "Moss color", kind: "color", default: "#A9852F" },
  { key: "tuftColor", label: "Tuft color", kind: "color", default: "#6f7a2c" },
] as const;

/**
 * Ochre moss dunes: rolling wind-swept mounds carpeting a dead-sea bottom. Two crossed
 * wave trains set the dune field; crest sharpness pinches the ridges from rounded to
 * wind-swept, and small procedural tufts of alien vegetation are scattered over the crests.
 * Faceted, yellowish-ochre with greenish tufts.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const height = p.height as number;
  const freq = Math.max(1, Math.round(p.frequency as number));
  const crest = p.crest as number;
  const tufts = Math.max(0, Math.round(p.overgrowth as number));

  const ph1 = rng() * Math.PI * 2;
  const ph2 = rng() * Math.PI * 2;
  const ph3 = rng() * Math.PI * 2;
  const k = (freq * Math.PI) / HALF;
  // Crest sharpness reshapes a 0..1 wave: low -> rounded, high -> pinched ridges.
  const shapeExp = 1 + crest * 2.2;

  const h = (x: number, z: number) => {
    // Sum of crossed sine trains + a diagonal one for irregularity, normalized to 0..1.
    let w =
      Math.sin(x * k + ph1) * 0.5 +
      Math.sin(z * k + ph2) * 0.5 +
      Math.sin((x + z) * k * 0.6 + ph3) * 0.35;
    w = (w / 1.35) * 0.5 + 0.5; // -> 0..1
    return height * Math.pow(Math.min(1, Math.max(0, w)), shapeExp);
  };

  const hexBase = p.hexBase as boolean;
  const geo = heightfieldSolid(42, HALF, h, hexBase ? "hex" : "square");

  // Point-in-footprint test so tufts stay within a hex base (pointy-top, apothem at HALF).
  const inside = (x: number, z: number) => {
    if (!hexBase) return Math.abs(x) <= HALF * 0.92 && Math.abs(z) <= HALF * 0.92;
    const theta = Math.atan2(z, x);
    const a = (((theta - Math.PI / 6) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
    const edge = (HALF * Math.cos(Math.PI / 6)) / Math.cos(a - Math.PI / 6);
    return Math.hypot(x, z) <= edge * 0.9;
  };

  // Scatter little tuft pyramids on raised ground (crests read greener via tuftColor band).
  const positions = [...(geo.getAttribute("position").array as Float32Array)];
  const indices = [...(geo.index!.array as Uint32Array | Uint16Array)];
  const addTuft = (x: number, z: number, base: number) => {
    const r = 0.018 + rng() * 0.022;
    const th = 0.04 + rng() * 0.04 + height * 0.1;
    const a = rng() * Math.PI * 2;
    const v0 = positions.length / 3;
    for (let s = 0; s < 3; s++) {
      const ang = a + (s / 3) * Math.PI * 2;
      positions.push(x + Math.cos(ang) * r, base, z + Math.sin(ang) * r);
    }
    positions.push(x, base + th, z); // apex
    const apex = v0 + 3;
    indices.push(v0, apex, v0 + 1, v0 + 1, apex, v0 + 2, v0 + 2, apex, v0);
  };
  for (let i = 0; i < tufts; i++) {
    const x = (rng() - 0.5) * 2 * HALF * 0.92;
    const z = (rng() - 0.5) * 2 * HALF * 0.92;
    const base = h(x, z);
    if (base > height * 0.45 && inside(x, z)) addTuft(x, z, base);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setIndex(indices);
  const faceted = facet(out);

  const mossColor = p.mossColor as string;
  const tuftColor = p.tuftColor as string;
  // Troughs slightly darker, crests toward the moss color, tuft tips greener at the very top.
  applyHeightBands(
    faceted,
    [
      { t: 0, color: "#7c5f23" },
      { t: 0.6, color: mossColor },
      { t: 0.85, color: mossColor },
      { t: 1, color: tuftColor },
    ],
    makeRng(seed ^ 0x5bd1e995),
    0.08,
  );
  return { kind: "mesh", geometry: faceted, color: mossColor };
}

export const mossDunesDef: ArtifactDef = {
  type: "mossdunes",
  label: "Moss Dunes",
  category: "terrain",
  output: "mesh",
  contract: "mossdunes",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "mossdunes",
  promptSeed:
    "low-poly stylized Barsoomian ochre moss dunes, rolling wind-swept mounds of yellow-ochre moss with small alien vegetation tufts, matte, engraved-illustration look, game asset.",
};
