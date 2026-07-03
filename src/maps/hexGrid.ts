// Pointy-top axial hex-grid math for the Maps painter (MAP_MODDING.md §6.1).
// Circumradius = 1, matching Viewport.tsx's single-hex HexFootprint (same
// corner-angle formula) — the painter grid is visually consistent with the
// existing single-artifact preview, just tiled cols x rows instead of one cell.
//
// This does NOT need to match the game's own HexMath pixel-for-pixel — a map
// document only ever stores integer {hex:[q,r], type} pairs (MapEntry.terrain);
// Godot's HexMath re-derives its own screen layout from those integers
// independently. What matters here is that axialToWorld/worldToAxial are
// mutual inverses so painting (raycast -> hex) and rendering (hex -> world)
// agree with each other.

export interface Axial {
  q: number;
  r: number;
}

const SQRT3 = Math.sqrt(3);

/** Center of hex (q, r) in world (x, z), circumradius `size`. */
export function axialToWorld(q: number, r: number, size = 1): { x: number; z: number } {
  return {
    x: size * SQRT3 * (q + r / 2),
    z: size * 1.5 * r,
  };
}

/** Inverse of axialToWorld: world (x, z) -> the nearest integer hex (q, r). */
export function worldToAxial(x: number, z: number, size = 1): Axial {
  const qf = ((x / size) * SQRT3) / 3 - z / size / 3;
  const rf = (z / size * 2) / 3;
  return roundAxial(qf, rf);
}

/** Round fractional axial coordinates to the nearest integer hex, correcting
 *  for cube-coordinate rounding drift (the standard hex-rounding algorithm). */
function roundAxial(qf: number, rf: number): Axial {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let x = Math.round(xf);
  let y = Math.round(yf);
  let z = Math.round(zf);
  const dx = Math.abs(x - xf);
  const dy = Math.abs(y - yf);
  const dz = Math.abs(z - zf);
  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;
  return { q: x, r: z };
}

/** The 6 corner offsets of a pointy-top hex (circumradius `size`), open (not
 *  closed back to the first point) — callers close the loop themselves. */
export function hexCorners(size = 1): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push({ x: Math.cos(a) * size, z: Math.sin(a) * size });
  }
  return pts;
}

export interface BoardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  width: number;
  depth: number;
}

/** World-space bounding box of a cols x rows field's hex centers, expanded by
 *  `margin` world units so the board's outermost hexes aren't clipped at the
 *  edge. Shared by MapViewport's ground plane (sizing/click-bounds) and its
 *  camera framing (centroid) — one source of truth for "where is the board". */
export function boardBounds(cols: number, rows: number, size = 1, margin = 2): BoardBounds {
  const c0 = axialToWorld(0, 0, size);
  const c1 = axialToWorld(Math.max(cols - 1, 0), 0, size);
  const c2 = axialToWorld(0, Math.max(rows - 1, 0), size);
  const c3 = axialToWorld(Math.max(cols - 1, 0), Math.max(rows - 1, 0), size);
  const xs = [c0.x, c1.x, c2.x, c3.x];
  const zs = [c0.z, c1.z, c2.z, c3.z];
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minZ = Math.min(...zs) - margin;
  const maxZ = Math.max(...zs) + margin;
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

/** Every (q, r) in a cols x rows rectangular field, column-major to match the
 *  game's `map_row_offset`-free rectangular field (MAP_MODDING plans a future
 *  offset field shape; for now this mirrors flyers' simple rectangular grid). */
export function* fieldCells(cols: number, rows: number): Generator<Axial> {
  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      yield { q, r };
    }
  }
}

export function cellKey(q: number, r: number): string {
  return `${q},${r}`;
}
