// Arrow-key panning for the Maps painter: which way the board moves, and how far.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PAN_KEYS, PAN_PX_PER_SEC, arrowPanStep } from "../panKeys";
import { boardBounds } from "../hexGrid";
import { LOOK_Y, camPosForTarget } from "../../viewport/isoCamera";

/** The camera MapViewport builds: orthographic, iso rig, framed on the board. */
function boardCamera(cols = 20, rows = 20, zoom = 30): THREE.OrthographicCamera {
  const b = boardBounds(cols, rows);
  const cam = new THREE.OrthographicCamera(-330, 330, 336, -336, -200, 200);
  cam.zoom = zoom;
  cam.position.set(...camPosForTarget(b.cx, LOOK_Y, b.cz));
  cam.lookAt(b.cx, LOOK_Y, b.cz);
  cam.updateMatrixWorld(true);
  return cam;
}

const keys = (...k: string[]) => new Set(k);

describe("arrowPanStep", () => {
  it("moves the view along the screen axes at the iso angle", () => {
    const cam = boardCamera();
    // The rig has no yaw, so screen-right is +X and screen-up is -Z on the ground.
    const rightStep = arrowPanStep(keys("ArrowRight"), cam.matrix, cam.zoom, 1 / 60);
    expect(rightStep.x).toBeGreaterThan(0);
    expect(rightStep.y).toBe(0);
    expect(rightStep.z).toBeCloseTo(0);

    const upStep = arrowPanStep(keys("ArrowUp"), cam.matrix, cam.zoom, 1 / 60);
    expect(upStep.z).toBeLessThan(0);
    expect(upStep.y).toBe(0);
    expect(upStep.x).toBeCloseTo(0);

    // Opposites cancel exactly, so Left/Down are the mirror of Right/Up.
    expect(arrowPanStep(keys("ArrowLeft"), cam.matrix, cam.zoom, 1 / 60).x).toBeCloseTo(-rightStep.x);
    expect(arrowPanStep(keys("ArrowDown"), cam.matrix, cam.zoom, 1 / 60).z).toBeCloseTo(-upStep.z);
  });

  it("keeps pan screen-aligned after the camera is orbited", () => {
    // Alt-drag orbits the rig; the board should still slide the way the arrow
    // points on screen, not along a frozen world axis.
    const b = boardBounds(20, 20);
    const cam = boardCamera();
    cam.position.set(b.cx + 8, LOOK_Y + 6, b.cz); // swung 90 deg: now looking from +X
    cam.lookAt(b.cx, LOOK_Y, b.cz);
    cam.updateMatrixWorld(true);

    const step = arrowPanStep(keys("ArrowRight"), cam.matrix, cam.zoom, 1 / 60);
    expect(step.z).toBeLessThan(0); // looking west, screen-right swings round to -Z
    expect(step.x).toBeCloseTo(0);
    expect(step.y).toBe(0);
  });

  it("covers the same screen distance at any zoom", () => {
    const near = boardCamera(20, 20, 200);
    const far = boardCamera(20, 20, 10);
    const dt = 0.25;
    const nearStep = arrowPanStep(keys("ArrowRight"), near.matrix, near.zoom, dt).length();
    const farStep = arrowPanStep(keys("ArrowRight"), far.matrix, far.zoom, dt).length();
    // World units scale with 1/zoom, which is exactly what holds the on-screen
    // speed (world units * zoom = pixels) constant.
    expect(nearStep * near.zoom).toBeCloseTo(PAN_PX_PER_SEC * dt);
    expect(farStep * far.zoom).toBeCloseTo(PAN_PX_PER_SEC * dt);
    expect(farStep).toBeGreaterThan(nearStep);
  });

  it("does not let a diagonal outrun a straight pan", () => {
    const cam = boardCamera();
    const straight = arrowPanStep(keys("ArrowRight"), cam.matrix, cam.zoom, 1 / 60).length();
    const diagonal = arrowPanStep(keys("ArrowRight", "ArrowUp"), cam.matrix, cam.zoom, 1 / 60).length();
    expect(diagonal).toBeCloseTo(straight);
  });

  it("stays put when nothing pannable is held or the axes cancel", () => {
    const cam = boardCamera();
    const zero = new THREE.Vector3();
    expect(arrowPanStep(keys(), cam.matrix, cam.zoom, 1 / 60)).toEqual(zero);
    expect(arrowPanStep(keys("Shift", "a"), cam.matrix, cam.zoom, 1 / 60)).toEqual(zero);
    expect(arrowPanStep(keys("ArrowLeft", "ArrowRight"), cam.matrix, cam.zoom, 1 / 60)).toEqual(zero);
    // A stalled frame (dt 0) or a nonsense zoom must not produce NaNs.
    expect(arrowPanStep(keys("ArrowUp"), cam.matrix, cam.zoom, 0)).toEqual(zero);
    expect(arrowPanStep(keys("ArrowUp"), cam.matrix, 0, 1 / 60)).toEqual(zero);
  });

  it("reuses the caller's output vector", () => {
    const cam = boardCamera();
    const out = new THREE.Vector3();
    expect(arrowPanStep(keys("ArrowUp"), cam.matrix, cam.zoom, 1 / 60, out)).toBe(out);
  });

  it("claims exactly the four arrow keys", () => {
    expect([...PAN_KEYS].sort()).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
  });
});
