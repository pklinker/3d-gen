// Pure vertex-array builders for the Maps painter's board rendering
// (MapViewport.tsx). Deliberately three.js-free (plain number[] out) so these
// are unit-testable without a renderer/WebGL context — MapViewport wraps the
// result in a THREE.BufferGeometry.
//
// Both builders produce ONE geometry for the WHOLE board regardless of cols x
// rows (MAP_MODDING.md §0.12: merged grid + InstancedMesh, O(kinds) draw
// calls, not O(cells)) — the grid outline is one LineSegments, the deploy-band
// tint is one filled mesh, each a single draw call no matter the board size.

import { axialToWorld, hexCorners } from "./hexGrid";

/** Line-segment positions (x,y,z pairs) for every hex boundary edge in a
 *  cols x rows field, one draw call's worth regardless of board size. */
export function buildGridLinePositions(cols: number, rows: number, size = 1): number[] {
  const corners = hexCorners(size);
  const positions: number[] = [];
  const y = 0.001; // lifted a hair off the ground plane to avoid z-fighting
  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      const { x: cx, z: cz } = axialToWorld(q, r, size);
      for (let i = 0; i < 6; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        positions.push(cx + a.x, y, cz + a.z, cx + b.x, y, cz + b.z);
      }
    }
  }
  return positions;
}

export interface FillGeometryData {
  positions: number[];
  indices: number[];
}

/** Triangle-fan-per-hex fill for every (q, r) in `cells`, merged into one mesh
 *  (one draw call for however many hexes are tinted). Used for the deploy-band
 *  tint (HexMaskFill's per-hex idiom, generalized to many hexes at once). */
export function buildFillGeometry(cells: { q: number; r: number }[], size = 1, y = 0.0008): FillGeometryData {
  const corners = hexCorners(size);
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  for (const { q, r } of cells) {
    const { x: cx, z: cz } = axialToWorld(q, r, size);
    positions.push(cx, y, cz);
    const centerIdx = vi;
    vi++;
    for (let i = 0; i < 6; i++) {
      const c = corners[i];
      positions.push(cx + c.x, y, cz + c.z);
      vi++;
    }
    for (let i = 0; i < 6; i++) {
      indices.push(centerIdx, centerIdx + 1 + i, centerIdx + 1 + ((i + 1) % 6));
    }
  }
  return { positions, indices };
}

/** Every hex in the deploy bands (west: cols [0, deployZoneCols); east: the
 *  mirrored band from the east edge — matches TurnEngine._in_deploy_band in
 *  the game), for buildFillGeometry. Clamped so a deployZoneCols >= half the
 *  board doesn't double-tint the overlapping middle twice as bright — the
 *  bands are capped to not exceed the board's own width. */
export function deployBandCells(cols: number, rows: number, deployZoneCols: number): { q: number; r: number }[] {
  const band = Math.max(0, Math.min(deployZoneCols, Math.ceil(cols / 2)));
  if (band === 0) return [];
  const cells: { q: number; r: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < band; q++) cells.push({ q, r });
    for (let q = cols - band; q < cols; q++) {
      if (q >= band) cells.push({ q, r }); // avoid re-adding overlapping columns when bands meet
    }
  }
  return cells;
}
