import * as THREE from "three";
import { groundAtNdc } from "./picking";
import { ISO_ELEVATION_DEG } from "../viewport/isoCamera";
import type { BoardBounds } from "./hexGrid";

// How much of the board the camera can actually see, and what that implies for
// how far it may pan and how far out it may zoom.
//
// The rule everything here serves: the BOARD covers the CANVAS. Bounding the
// look-at point (the board's own box) isn't the same thing and isn't enough —
// a target parked on the board's corner still leaves most of the screen empty,
// because half the viewport is hanging off the edge of the field.

/** The half of BoardBounds that describes a rectangle in the ground plane —
 *  the shape both the board's own extent and a pan limit take. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Screen Y is foreshortened by the rig's tilt: a world Z unit spans only
// sin(elevation) pixels, where a world X unit spans a full one. Ignoring this
// is why a board could look "fitted" and still leave bands above and below.
const DEPTH_PER_PIXEL = Math.sin((ISO_ELEVATION_DEG * Math.PI) / 180);

/** The patch of ground currently on screen, as an axis-aligned rectangle.
 *  Taken from the four screen corners rather than from zoom arithmetic, so it
 *  stays honest after an orbit — a yawed view sees a diamond of ground, and
 *  this is the box around it. Null when the view is edge-on. */
export function visibleGroundRect(camera: THREE.Camera): Rect | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [nx, ny] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const g = groundAtNdc(camera, nx, ny);
    if (!g) return null;
    minX = Math.min(minX, g.x);
    maxX = Math.max(maxX, g.x);
    minZ = Math.min(minZ, g.z);
    maxZ = Math.max(maxZ, g.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Where the look target may go while the board still covers the whole canvas.
 *
 *  Derived by sliding the visible rectangle inside the board's rectangle and
 *  reading off where the target sits relative to it. When the view is wider
 *  than the board on an axis — zoomed out past the fit, or orbited so shallow
 *  the ground stretches — the range collapses to the single centred value:
 *  there is nowhere to pan to that would show more board, so panning on that
 *  axis simply stops.
 *
 *  Null when the visible rect can't be determined (edge-on view), which callers
 *  treat as "don't clamp" rather than "clamp to nothing". */
export function panLimits(camera: THREE.Camera, target: THREE.Vector3, board: BoardBounds): Rect | null {
  const view = visibleGroundRect(camera);
  if (!view) return null;
  const x = axisLimits(target.x, view.minX, view.maxX, board.minX, board.maxX);
  const z = axisLimits(target.z, view.minZ, view.maxZ, board.minZ, board.maxZ);
  return { minX: x.lo, maxX: x.hi, minZ: z.lo, maxZ: z.hi };
}

function axisLimits(
  target: number,
  viewLo: number,
  viewHi: number,
  boardLo: number,
  boardHi: number,
): { lo: number; hi: number } {
  // The target need not sit at the centre of what it sees (the rig looks at
  // LOOK_Y, slightly above the ground it is measuring), so carry the offset
  // through rather than assuming symmetry.
  const half = (viewHi - viewLo) / 2;
  const offset = target - (viewLo + viewHi) / 2;
  const lo = boardLo + half + offset;
  const hi = boardHi - half + offset;
  if (lo > hi) {
    const centred = (lo + hi) / 2; // view outruns the board: pin it, centred
    return { lo: centred, hi: centred };
  }
  return { lo, hi };
}

/** The zoom at which the board fills a `width` x `height` canvas edge to edge —
 *  the framing the board opens at, and the point below which dead space starts
 *  to show along one pair of edges.
 *
 *  Orthographic zoom is pixels per world unit (R3F sizes the default frustum to
 *  the canvas's own pixel dimensions), so covering the canvas means the board is
 *  at least `width` pixels across and `height` pixels tall — the latter after
 *  the tilt has had its way with the board's depth. Whichever axis needs more
 *  zoom decides; the other overflows off-screen and is reached by panning.
 *
 *  Assumes the rig's own elevation with no yaw, which is the state the board is
 *  framed in; an orbit away from it is handled by panLimits collapsing instead. */
export function coverZoom(board: BoardBounds, width: number, height: number): number {
  const [acrossX, acrossZ] = zoomRatios(board, width, height);
  return Math.max(acrossX, acrossZ);
}

/** The zoom at which the WHOLE board just fits inside the canvas — the floor for
 *  zooming out.
 *
 *  The mirror of coverZoom: the same two ratios, the other extreme. Taking in the
 *  whole board at once means accepting bars along the axis that doesn't fill,
 *  which is a fair trade when it's asked for deliberately. Below this point the
 *  board would only shrink away from the frame on every side, which isn't.
 *
 *  panLimits handles the rest: once the view is wider than the board it pins the
 *  target centred, so a zoomed-out board sits in the middle with even margins
 *  instead of drifting into a corner. */
export function containZoom(board: BoardBounds, width: number, height: number): number {
  const [acrossX, acrossZ] = zoomRatios(board, width, height);
  return Math.min(acrossX, acrossZ);
}

/** Zoom needed to span the canvas on each axis: across the board's width, and
 *  across its foreshortened depth. */
function zoomRatios(board: BoardBounds, width: number, height: number): [number, number] {
  return [width / Math.max(board.width, 1e-6), height / Math.max(board.depth * DEPTH_PER_PIXEL, 1e-6)];
}
