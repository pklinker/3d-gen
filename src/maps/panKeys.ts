import * as THREE from "three";

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
 *  The axes come from the camera's own matrix flattened onto the ground plane,
 *  not from fixed world axes, so panning still tracks the screen after the user
 *  alt-orbits: right = screen-right, forward = screen-up projected onto the
 *  board. Arrow-up walks the view up-screen (the board slides down), matching
 *  how scrolling a document behaves.
 *
 *  Returns `out` set to (0,0,0) when nothing pannable is held. */
export function arrowPanStep(
  held: ReadonlySet<string>,
  cameraMatrix: THREE.Matrix4,
  zoom: number,
  dt: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  out.set(0, 0, 0);
  const x = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
  const z = (held.has("ArrowUp") ? 1 : 0) - (held.has("ArrowDown") ? 1 : 0);
  if ((x === 0 && z === 0) || zoom <= 0 || dt <= 0) return out;

  right.setFromMatrixColumn(cameraMatrix, 0).setY(0);
  // Degenerate only if the camera looks straight down its own X axis — can't
  // happen with the iso rig, but bail rather than emit NaNs if it ever does.
  if (right.lengthSq() === 0) return out;
  right.normalize();
  forward.copy(UP).cross(right); // screen-up, projected onto the ground plane

  out.addScaledVector(right, x).addScaledVector(forward, z);
  // Normalize so a diagonal (two keys held) isn't 1.41x faster than a straight one.
  return out.normalize().multiplyScalar((PAN_PX_PER_SEC * dt) / zoom);
}
