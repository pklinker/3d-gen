import * as THREE from "three";
import { worldToAxial, type Axial } from "./hexGrid";

/**
 * Pointer -> board hex, by intersecting the camera ray with the ground plane directly.
 *
 * This deliberately does NOT raycast against a mesh, because for the Maps rig there is no
 * height at which such a mesh works. The camera is orthographic with `near: -200`, so
 * `Raycaster.setFromCamera` starts the pick ray at NDC z = 0 — the plane through the camera
 * itself — and that plane tilts with the screen, dropping ~0.048 world units per pixel below
 * the viewport's centre. The camera sits only ~6.1 units above the board, so roughly 60px
 * below centre the ray's own origin has already sunk past y=3 (and ~130px below centre, past
 * y=0). A pick mesh at either height is then BEHIND the ray origin, where the raycaster's
 * `near = 0` discards it: pointer events over the bottom of the board silently stopped
 * arriving, which read as "the bottom six rows can't be painted".
 *
 * An analytic intersection has no near plane to fall foul of, no mesh extent to run off, and
 * no parallax to correct for — a ray is a line, and the line meets y=0 wherever it meets it,
 * in front of the origin or behind.
 */

const ORIGIN = new THREE.Vector3();
const DIR = new THREE.Vector3();

/**
 * The ground (y=0) hex under normalized-device pointer coords, or null when the view is
 * edge-on and the ray never meets the ground.
 *
 * Assumes the ORTHOGRAPHIC rig every viewport here shares (isoCamera.ts): all pick rays are
 * parallel, so the camera's own forward vector is each ray's direction. A perspective camera
 * would need the direction taken from the unprojected point back to the eye instead.
 */
export function hexAtPointer(camera: THREE.Camera, ndcX: number, ndcY: number): Axial | null {
  ORIGIN.set(ndcX, ndcY, 0).unproject(camera);
  camera.getWorldDirection(DIR);
  if (Math.abs(DIR.y) < 1e-6) return null;
  const t = -ORIGIN.y / DIR.y;
  return worldToAxial(ORIGIN.x + t * DIR.x, ORIGIN.z + t * DIR.z);
}

/** Normalized-device coords of a pointer event within `rect`. */
export function ndcOf(clientX: number, clientY: number, rect: DOMRect): [number, number] {
  return [
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  ];
}
