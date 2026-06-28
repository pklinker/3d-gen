import * as THREE from "three";
import { SimplifyModifier } from "three-stdlib";
import { MESH_CONTRACTS } from "../contract/constants";
import { applyVerticalGradient, facet, shade } from "./proceduralEngine";

export interface ConformReport {
  triBefore: number;
  triAfter: number;
  decimated: boolean;
  recenterOffset: { x: number; z: number };
  baseDrop: number;
  scaleApplied: number;
}

/**
 * Force any geometry to satisfy the contract for its type, in this order:
 *  1) Apply transforms are assumed baked (we work on geometry directly).
 *  2) Recenter X/Z to origin.
 *  3) Drop the base so min-Y == 0.
 *  4) Rescale footprint into hex-circumradius units for the type.
 *  5) Decimate if over the triangle budget.
 * Returns the conformed geometry (a clone) and a report of what changed.
 */
export function conformGeometry(
  input: THREE.BufferGeometry,
  type: "hill" | "tower",
): { geometry: THREE.BufferGeometry; report: ConformReport } {
  const C = MESH_CONTRACTS[type];
  let geo = input.clone();

  const triBefore = triCount(geo);

  // 2 + 3: recenter X/Z, base to Y=0.
  geo.computeBoundingBox();
  let bb = geo.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const minY = bb.min.y;
  geo.translate(-cx, -minY, -cz);

  // 4: rescale footprint to the target. Use the larger of X/Z extent.
  geo.computeBoundingBox();
  bb = geo.boundingBox!;
  const extentX = bb.max.x - bb.min.x;
  const extentZ = bb.max.z - bb.min.z;
  const extent = Math.max(extentX, extentZ) || 1;
  const scale = C.footprint / extent;
  geo.scale(scale, scale, scale);
  // re-seat base to Y=0 after scaling (scale is about origin; base was at 0 so OK,
  // but guard against float drift)
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);

  // 5: decimate if over budget.
  let decimated = false;
  let triAfter = triCount(geo);
  if (triAfter > C.triBudget) {
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    const removable = nonIndexed.getAttribute("position").count;
    const targetTris = C.triBudget;
    const currentTris = removable / 3;
    const removeFrac = Math.min(0.9, 1 - targetTris / currentTris);
    const count = Math.floor(removable * removeFrac);
    try {
      const simplified = new SimplifyModifier().modify(nonIndexed, count);
      geo = facet(simplified);
      decimated = true;
      triAfter = triCount(geo);
    } catch {
      // SimplifyModifier can throw on non-manifold input; keep original.
      decimated = false;
    }
  }

  // Re-apply faceting + vertex colors so material/AO read stays on-contract.
  geo = facet(geo);
  applyVerticalGradient(geo, shade(C.color, 0.7), C.color);

  return {
    geometry: geo,
    report: {
      triBefore,
      triAfter,
      decimated,
      recenterOffset: { x: cx, z: cz },
      baseDrop: minY,
      scaleApplied: scale,
    },
  };
}

/** Build the contract-correct matte material (vertex colors as albedo). */
export function makeContractMaterial(type: "hill" | "tower"): THREE.MeshStandardMaterial {
  const C = MESH_CONTRACTS[type];
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: C.metalness,
    roughness: C.roughness,
    flatShading: true,
  });
}

export function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.getAttribute("position").count / 3;
}
