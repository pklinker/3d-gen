import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { hashCoords, siteNormal, weldSites } from "./weld";
import type { ArtifactCategory } from "../types";

/**
 * Baked ambient occlusion, multiplied into the geometry's existing vertex colors.
 *
 * Why bake rather than light it at runtime: the game never draws these meshes live — it
 * bakes each one to a sprite through an offscreen camera and caches that per ~15° of field
 * rotation. Contact darkening written into the `color` attribute therefore costs nothing at
 * runtime, survives the bake, and rides inside the `.glb` with no format extension: it is
 * just albedo as far as glTF is concerned.
 *
 * The pass runs on the conformed, faceted geometry (non-indexed, one vertex per triangle
 * corner). Occlusion is sampled once per *welded position* — a corner shared by six facets
 * is one sample, not six — and the result is written back to every duplicate at that spot,
 * so it costs roughly what an indexed mesh would while still shading each facet corner
 * independently. That gives a gradient across each facet rather than one flat value per
 * face, which is what actually reads as a crease.
 *
 * Fully deterministic: sample directions come from a Hammersley sequence rotated by a hash
 * of the sample position, so a given (seed, params) pair bakes byte-identical AO every time,
 * matching the determinism the rest of the generation pipeline promises.
 */

export interface AoOptions {
  /** Hemisphere rays cast per welded position, when the ray budget allows it. */
  samples?: number;
  /**
   * Soft cap on total rays, which is what actually keeps the editor's sliders draggable:
   * every param change re-bakes, so cost has to be bounded by the mesh, not left to grow
   * with it. Sample count per site is `clamp(rayBudget / sites, 8, samples)`, so detailed
   * assets (a few hundred sites) keep the full sample count and only the big heightfields
   * trade angular samples for the spatial ones they already have — a 2000-vertex dune field
   * resolves its own soft occlusion from vertex density, so the noise averages out. The
   * floor of 8 makes this a soft cap: a hypothetical very dense mesh degrades gracefully
   * rather than baking visible noise.
   */
  rayBudget?: number;
  /** Occlusion search distance, as a fraction of the bounding-box diagonal. */
  radius?: number;
  /** Strength of the darkening, 0 (off) … 1 (full). */
  intensity?: number;
  /**
   * Treat the Y = 0 plane as an infinite occluder. True for anything that stands on the
   * ground (terrain, buildings): it darkens the skirt where a wall meets the dirt, which is
   * the single strongest "this is sitting there" cue. False for craft — a ship is only
   * resting its keel on Y = 0 as an editor anchoring convention, and in the game it flies.
   */
  groundPlane?: boolean;
  /** Floor on the brightness multiplier, so deep crevices darken but never go to black. */
  minLight?: number;
}

const DEFAULTS: Required<AoOptions> = {
  samples: 24,
  rayBudget: 16000,
  radius: 0.18,
  intensity: 0.7,
  groundPlane: true,
  minLight: 0.34,
};

/** Lower bound on per-site samples; see AoOptions.rayBudget. */
const MIN_SAMPLES = 8;

/**
 * Does this category's artifact rest on the ground? Ships and ordnance are airborne in
 * play — their Y = 0 contact is only the editor's anchoring convention (see the `fighter`
 * and `scout` contract notes), so baking a ground shadow into them would be a lie.
 */
export function sitsOnGround(category: ArtifactCategory): boolean {
  return category === "terrain" || category === "buildings";
}

/** Radical inverse base 2 — the second Hammersley coordinate. */
function radicalInverse2(i: number): number {
  let bits = i >>> 0;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  return bits * 2.3283064365386963e-10;
}

/**
 * Multiply baked ambient occlusion into `geo`'s vertex colors, in place.
 *
 * Expects the faceted (non-indexed) geometry that `facet()` produces, already carrying a
 * `color` attribute — AO scales existing albedo, it does not create it. A geometry missing
 * either is left untouched rather than guessed at.
 */
export function bakeAmbientOcclusion(geo: THREE.BufferGeometry, opts: AoOptions = {}): void {
  const o = { ...DEFAULTS, ...opts };
  const col = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!col || !pos || geo.index) return;
  if (o.intensity <= 0 || o.samples <= 0) return;

  // Weld duplicate corners once; every per-vertex pass in the pipeline shares this step.
  const { sites, diag } = weldSites(geo);
  if (sites.length === 0) return;
  const maxDist = diag * o.radius;
  // Lift the ray origin off its own surface so the face it starts on can't occlude it.
  const eps = diag * 1e-4;

  // Sample count is settled here, once the welded site count is known.
  const samples = Math.max(
    MIN_SAMPLES,
    Math.min(o.samples, Math.floor(o.rayBudget / Math.max(1, sites.length))),
  );

  // --- BVH over a throwaway geometry ---
  // MeshBVH's ensureIndex() calls setIndex() on whatever it is handed, and then sorts that
  // index in place. Handing it `geo` would leave the artifact indexed and reordered, which
  // breaks the invariant paintRange() relies on (index order == vertex order after facet).
  // The position attribute is only read, never written, so sharing it here is safe.
  const bvhGeo = new THREE.BufferGeometry();
  bvhGeo.setAttribute("position", pos);
  const bvh = new MeshBVH(bvhGeo);

  const ray = new THREE.Ray();
  for (const site of sites) {
    const [nx, ny, nz] = siteNormal(site);

    // Orthonormal basis around the normal: t = up × n, s = n × t, with `up` picked off-axis
    // so the cross product can't collapse on a near-vertical normal.
    const upx = Math.abs(ny) < 0.9 ? 0 : 1;
    const upy = Math.abs(ny) < 0.9 ? 1 : 0;
    let tx = upy * nz;
    let ty = -upx * nz;
    let tz = upx * ny - upy * nx;
    const tlen = Math.hypot(tx, ty, tz) || 1;
    tx /= tlen; ty /= tlen; tz /= tlen;
    const sx = ny * tz - nz * ty;
    const sy = nz * tx - nx * tz;
    const sz = nx * ty - ny * tx;

    const ox = site.x + nx * eps;
    const oy = site.y + ny * eps;
    const oz = site.z + nz * eps;
    ray.origin.set(ox, oy, oz);

    // Per-site azimuth rotation, hashed from the position. A single shared sample set would
    // put the same ray fan on every corner and print its pattern into the shading as banding;
    // hashing keeps the rotation deterministic while decorrelating neighbors.
    const phase = hashCoords(site.qx, site.qy, site.qz) * Math.PI * 2;

    let occlusion = 0;
    for (let i = 0; i < samples; i++) {
      // Cosine-weighted hemisphere sample — density already matches the N·L falloff of
      // diffuse light, so a plain average of the hits is the correct visibility integral.
      const u1 = (i + 0.5) / samples;
      const u2 = radicalInverse2(i);
      const r = Math.sqrt(u1);
      const phi = u2 * Math.PI * 2 + phase;
      const lx = r * Math.cos(phi);
      const ly = r * Math.sin(phi);
      const lz = Math.sqrt(Math.max(0, 1 - u1));
      const dx = tx * lx + sx * ly + nx * lz;
      const dy = ty * lx + sy * ly + ny * lz;
      const dz = tz * lx + sz * ly + nz * lz;
      ray.direction.set(dx, dy, dz).normalize();

      // DoubleSide, not FrontSide: the builders assemble triangle soup from many parts and
      // orient each part outward from its own centroid, so a barrel buried in a turret
      // presents backfaces to the surface around it. Those still occlude.
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, eps, maxDist);

      // Linear falloff — a contact right at the surface occludes fully, one at the search
      // radius not at all. Nearest occluder wins, so max() over mesh and ground is correct.
      let occ = hit ? 1 - hit.distance / maxDist : 0;
      if (o.groundPlane && ray.direction.y < -1e-6) {
        const tGround = -ray.origin.y / ray.direction.y;
        if (tGround > eps && tGround < maxDist) {
          occ = Math.max(occ, 1 - tGround / maxDist);
        }
      }
      occlusion += occ;
    }

    const m = Math.max(o.minLight, 1 - o.intensity * (occlusion / samples));
    for (const vi of site.verts) {
      col.setXYZ(vi, col.getX(vi) * m, col.getY(vi) * m, col.getZ(vi) * m);
    }
  }

  col.needsUpdate = true;
}
