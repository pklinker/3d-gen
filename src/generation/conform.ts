import * as THREE from "three";
import { SimplifyModifier } from "three-stdlib";
import { MESH_CONTRACTS, HEX_FLAT_TO_FLAT, type ContractKey } from "../contract/constants";
import { applyVerticalGradient, creaseNormals, facet, shade } from "./proceduralEngine";
import { bakeAmbientOcclusion, sitsOnGround } from "./ambientOcclusion";
import { SURFACE_ORDER, finishSpec, type SurfaceFinish } from "../contract/surfaces";
import type { ArtifactCategory } from "../types";

export interface ConformReport {
  triBefore: number;
  triAfter: number;
  decimated: boolean;
  recenterOffset: { x: number; z: number };
  baseDrop: number;
  scaleApplied: number;
  /** Milliseconds spent in the AO bake, or null when it was skipped. */
  aoMs: number | null;
}

/**
 * Force any geometry to satisfy the contract for its type, in this order:
 *  1) Apply transforms are assumed baked (we work on geometry directly).
 *  2) Recenter X/Z to origin.
 *  3) Drop the base so min-Y == 0.
 *  4) Rescale footprint into hex-circumradius units for the type.
 *  5) Decimate if over the triangle budget.
 *  6) Crease normals, softening shallow edges.
 *  7) Bake ambient occlusion into the vertex colors.
 * Returns the conformed geometry (a clone) and a report of what changed.
 */
export function conformGeometry(
  input: THREE.BufferGeometry,
  contract: ContractKey,
  opts: {
    fitToHex?: boolean;
    category?: ArtifactCategory;
    ao?: boolean;
    /** Widest edge still smoothed, in degrees. Omit/0 to keep the mesh fully faceted. */
    smoothAngleDeg?: number;
  } = {},
): { geometry: THREE.BufferGeometry; report: ConformReport } {
  const C = MESH_CONTRACTS[contract];
  // Hex boundary mask: pull the footprint within the hex's flat-to-flat width so features
  // don't overhang the cell edges. Never upscales past the contract footprint, so types that
  // already sit inside the hex (towers, spires, …) are unaffected.
  const targetFootprint = opts.fitToHex
    ? Math.min(C.footprint, HEX_FLAT_TO_FLAT)
    : C.footprint;
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
  const scale = targetFootprint / extent;
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
      // SimplifyModifier returns a fresh geometry carrying position only, so any surface
      // groups the generator declared are gone — collapsing edges would have invalidated
      // their triangle ranges anyway. An ungrouped geometry is exactly the signal
      // makeContractMaterial() reads to fall back to the single contract material, so a
      // decimated mesh degrades to one finish rather than mis-assigning them.
      geo = facet(simplified);
      decimated = true;
      triAfter = triCount(geo);
    } catch {
      // SimplifyModifier can throw on non-manifold input; keep original.
      decimated = false;
    }
  }

  // Re-facet for clean per-face normals. Preserve the generator's own vertex colors
  // (each artifact paints its own palette); only fall back to the contract color when the
  // mesh carries none — e.g. AI-imported geometry.
  geo = facet(geo);
  if (!geo.getAttribute("color")) {
    applyVerticalGradient(geo, shade(C.color, 0.7), C.color);
  }

  // 6: soften normals across shallow edges, so turned surfaces (shafts, domes, barrels,
  // hulls) round out while box corners and rock facets stay crisp. Runs after facet(),
  // whose per-face normals it replaces, and after any decimation — the collapsed mesh needs
  // creasing off its own final triangles, not the ones it had before.
  if (opts.smoothAngleDeg) creaseNormals(geo, opts.smoothAngleDeg);

  // 7: bake contact shading into those colors. Last, so it sees the final triangles and the
  // final palette — AO scales albedo, so anything that repaints afterwards would erase it.
  // Independent of step 6: AO derives its own face normals from positions, so creasing
  // changes how the mesh shades but not how it occludes.
  let aoMs: number | null = null;
  if (opts.ao !== false) {
    const t0 = performance.now();
    bakeAmbientOcclusion(geo, {
      // A craft only rests on Y=0 as an editor anchoring convention; it flies in the game,
      // so it gets self-occlusion (under the wings, behind the nacelles) but no ground.
      groundPlane: sitsOnGround(opts.category ?? "terrain"),
    });
    aoMs = performance.now() - t0;
  }

  return {
    geometry: geo,
    report: {
      triBefore,
      triAfter,
      decimated,
      recenterOffset: { x: cx, z: cz },
      baseDrop: minY,
      scaleApplied: scale,
      aoMs,
    },
  };
}

/**
 * Build the contract-correct matte material (vertex colors as albedo).
 *
 * Returns an *array* when the geometry carries surface groups, one entry per finish in
 * `SURFACE_ORDER` so a group's materialIndex means the same thing in every artifact — and a
 * single material otherwise. The two must agree: a mesh with a material array renders only
 * its groups, and a mesh with groups but one material ignores them. Pass the conformed
 * geometry so that pairing can't drift.
 */
export function makeContractMaterial(
  contract: ContractKey,
  geometry?: THREE.BufferGeometry,
): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
  const C = MESH_CONTRACTS[contract];
  const make = (finish: SurfaceFinish) => {
    const f = finishSpec(finish, C);
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: f.metalness,
      roughness: f.roughness,
      // Deliberately NOT flatShading. It was redundant — facet() leaves one face normal per
      // triangle corner, so the mesh shades flat from its normals alone — and it is actively
      // harmful now: flatShading makes the shader derive normals from screen-space
      // derivatives and ignore the normal attribute, which would silently discard the crease
      // pass. It also made the preview disagree with the export, since glTF has no
      // flatShading flag and the .glb was always shaded by the attribute.
      name: finish,
    });
  };
  if (!geometry || geometry.groups.length === 0) return make("default");
  return SURFACE_ORDER.map(make);
}

export function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.getAttribute("position").count / 3;
}
