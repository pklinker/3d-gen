import * as THREE from "three";
import {
  MESH_CONTRACTS,
  BASE_EPSILON,
  CENTER_EPSILON,
  type ContractKey,
} from "./constants";
import { triCount } from "../generation/conform";

export interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

export interface ValidationResult {
  checks: Check[];
  allPass: boolean;
}

/** Validate a conformed geometry against its mesh contract. */
export function validateMesh(
  geo: THREE.BufferGeometry,
  contract: ContractKey,
): ValidationResult {
  const C = MESH_CONTRACTS[contract];
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const checks: Check[] = [];

  // Base flush on Y=0.
  const baseY = bb.min.y;
  checks.push({
    label: "Base on Y = 0",
    pass: Math.abs(baseY) <= BASE_EPSILON,
    detail: `min Y = ${baseY.toFixed(4)}`,
  });

  // Centered on X/Z.
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  checks.push({
    label: "Centered on X/Z",
    pass: Math.abs(cx) <= CENTER_EPSILON && Math.abs(cz) <= CENTER_EPSILON,
    detail: `center = (${cx.toFixed(3)}, ${cz.toFixed(3)})`,
  });

  // Footprint within tolerance.
  const extent = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const fpLow = C.footprint * (1 - C.sizeTolerance);
  const fpHigh = C.footprint * (1 + C.sizeTolerance);
  checks.push({
    label: `Footprint ≈ ${C.footprint} units`,
    pass: extent >= fpLow && extent <= fpHigh,
    detail: `${extent.toFixed(3)} units (target ${C.footprint})`,
  });

  // Height within tolerance.
  const height = bb.max.y - bb.min.y;
  const hLow = C.height * (1 - C.sizeTolerance);
  const hHigh = C.height * (1 + C.sizeTolerance);
  checks.push({
    label: `Height ≈ ${C.height} units`,
    pass: height >= hLow && height <= hHigh,
    detail: `${height.toFixed(3)} units (target ${C.height})`,
  });

  // Triangle budget.
  const tris = triCount(geo);
  checks.push({
    label: `≤ ${C.triBudget} triangles`,
    pass: tris <= C.triBudget,
    detail: `${tris} tris`,
  });

  // Vertex colors present (proxy for material/albedo being set).
  checks.push({
    label: "Vertex colors present",
    pass: !!geo.getAttribute("color"),
    detail: geo.getAttribute("color") ? "color attribute set" : "missing",
  });

  return { checks, allPass: checks.every((c) => c.pass) };
}
