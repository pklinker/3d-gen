import * as THREE from "three";
import type { BoardBounds } from "./hexGrid";

// Arrow-key panning for the map viewport. Kept out of the React component so
// the direction math is testable on its own (the rest of maps/ follows the same
// pure-module + __tests__ split).

export const PAN_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Pan speed in SCREEN pixels per second. Dividing by the orthographic zoom
 *  (which is pixels-per-world-unit for this rig — see MapViewport's fitZoom)
 *  turns it into world units, so a keypress moves the board the same visible
 *  distance whether the user is zoomed way in on one hex or fitted to a 96x96
 *  field. */
export const PAN_PX_PER_SEC = 900;

const right = new THREE.Vector3();
const forward = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** World-space offset to add to both the camera and the orbit target for this
 *  frame, given which arrow keys are held.
 *
 *  The axes come from the camera's own orientation flattened onto the ground
 *  plane, not from fixed world axes, so panning still tracks the screen after
 *  the user alt-orbits: right = screen-right, forward = screen-up projected
 *  onto the board. Arrow-up walks the view up-screen (the board slides down),
 *  matching how scrolling a document behaves.
 *
 *  Orientation comes from the camera's QUATERNION, not its matrix: a camera's
 *  matrix is only recomposed during the render pass, so read from a useFrame
 *  callback it trails the real orientation by a frame after an orbit — and is
 *  plain stale on the first frames, when IsoCamera has aimed the camera outside
 *  the loop. Either way the pan slides off-axis (arrow-right creeping in Z).
 *  lookAt writes the quaternion immediately, so it is always current.
 *
 *  Returns `out` set to (0,0,0) when nothing pannable is held. */
export function arrowPanStep(
  held: ReadonlySet<string>,
  cameraQuaternion: THREE.Quaternion,
  zoom: number,
  dt: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  out.set(0, 0, 0);
  const x = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
  const z = (held.has("ArrowUp") ? 1 : 0) - (held.has("ArrowDown") ? 1 : 0);
  if ((x === 0 && z === 0) || zoom <= 0 || dt <= 0) return out;

  right.set(1, 0, 0).applyQuaternion(cameraQuaternion).setY(0);
  // Degenerate only if the camera looks straight down its own X axis — can't
  // happen with the iso rig, but bail rather than emit NaNs if it ever does.
  if (right.lengthSq() === 0) return out;
  right.normalize();
  forward.copy(UP).cross(right); // screen-up, projected onto the ground plane

  out.addScaledVector(right, x).addScaledVector(forward, z);
  // Normalize so a diagonal (two keys held) isn't 1.41x faster than a straight one.
  return out.normalize().multiplyScalar((PAN_PX_PER_SEC * dt) / zoom);
}

/** How far of `step` the look target may actually travel — held to the board's
 *  bounding box (margin included), so arrowing never sails off into empty space
 *  with the field nowhere on screen. At the limit the centre of the view sits on
 *  the board's outer edge, which still leaves the board filling half the canvas.
 *
 *  Clamped per axis, so running into the west edge while also holding Up slides
 *  along that edge instead of stopping dead.
 *
 *  A target that starts outside the box isn't snapped back (a keypress that
 *  yanked the view somewhere else would be worse than the drift), it just can't
 *  be pushed further out — boardClampOffset is the one that hauls it home. */
export function clampPanStep(step: THREE.Vector3, targetX: number, targetZ: number, bounds: BoardBounds): THREE.Vector3 {
  step.x = clampAxis(targetX, step.x, bounds.minX, bounds.maxX);
  step.z = clampAxis(targetZ, step.z, bounds.minZ, bounds.maxZ);
  return step;
}

/** The offset that hauls a look target back inside the board's box, or (0,0,0)
 *  if it is already there. `target` is left alone — the caller adds the offset
 *  to the target AND the camera, so the correction is a pure slide that leaves
 *  the view angle and distance untouched.
 *
 *  This is the hard version of the same limit clampPanStep enforces, for pans
 *  that happen INSIDE OrbitControls (right-drag) where there is no step of ours
 *  to trim — the move has already landed by the time we hear about it, so the
 *  only option is to pull it back. Rotation and zoom keep the target where it
 *  is, so they need no clamping of their own. */
export function boardClampOffset(target: THREE.Vector3, bounds: BoardBounds, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  return out.set(
    THREE.MathUtils.clamp(target.x, bounds.minX, bounds.maxX) - target.x,
    0,
    THREE.MathUtils.clamp(target.z, bounds.minZ, bounds.maxZ) - target.z,
  );
}

function clampAxis(from: number, delta: number, min: number, max: number): number {
  const lo = Math.min(min, from);
  const hi = Math.max(max, from);
  return THREE.MathUtils.clamp(from + delta, lo, hi) - from;
}
