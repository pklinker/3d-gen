// Arrow-key panning for the Maps painter: which way the board moves, and how far.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PAN_KEYS, PAN_PX_PER_SEC, arrowPanStep, boardClampOffset, clampPanStep } from "../panKeys";
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
    const rightStep = arrowPanStep(keys("ArrowRight"), cam.quaternion, cam.zoom, 1 / 60);
    expect(rightStep.x).toBeGreaterThan(0);
    expect(rightStep.y).toBe(0);
    expect(rightStep.z).toBeCloseTo(0);

    const upStep = arrowPanStep(keys("ArrowUp"), cam.quaternion, cam.zoom, 1 / 60);
    expect(upStep.z).toBeLessThan(0);
    expect(upStep.y).toBe(0);
    expect(upStep.x).toBeCloseTo(0);

    // Opposites cancel exactly, so Left/Down are the mirror of Right/Up.
    expect(arrowPanStep(keys("ArrowLeft"), cam.quaternion, cam.zoom, 1 / 60).x).toBeCloseTo(-rightStep.x);
    expect(arrowPanStep(keys("ArrowDown"), cam.quaternion, cam.zoom, 1 / 60).z).toBeCloseTo(-upStep.z);
  });

  it("keeps pan screen-aligned after the camera is orbited", () => {
    // Alt-drag orbits the rig; the board should still slide the way the arrow
    // points on screen, not along a frozen world axis.
    const b = boardBounds(20, 20);
    const cam = boardCamera();
    cam.position.set(b.cx + 8, LOOK_Y + 6, b.cz); // swung 90 deg: now looking from +X
    cam.lookAt(b.cx, LOOK_Y, b.cz);
    cam.updateMatrixWorld(true);

    const step = arrowPanStep(keys("ArrowRight"), cam.quaternion, cam.zoom, 1 / 60);
    expect(step.z).toBeLessThan(0); // looking west, screen-right swings round to -Z
    expect(step.x).toBeCloseTo(0);
    expect(step.y).toBe(0);
  });

  it("covers the same screen distance at any zoom", () => {
    const near = boardCamera(20, 20, 200);
    const far = boardCamera(20, 20, 10);
    const dt = 0.25;
    const nearStep = arrowPanStep(keys("ArrowRight"), near.quaternion, near.zoom, dt).length();
    const farStep = arrowPanStep(keys("ArrowRight"), far.quaternion, far.zoom, dt).length();
    // World units scale with 1/zoom, which is exactly what holds the on-screen
    // speed (world units * zoom = pixels) constant.
    expect(nearStep * near.zoom).toBeCloseTo(PAN_PX_PER_SEC * dt);
    expect(farStep * far.zoom).toBeCloseTo(PAN_PX_PER_SEC * dt);
    expect(farStep).toBeGreaterThan(nearStep);
  });

  it("does not let a diagonal outrun a straight pan", () => {
    const cam = boardCamera();
    const straight = arrowPanStep(keys("ArrowRight"), cam.quaternion, cam.zoom, 1 / 60).length();
    const diagonal = arrowPanStep(keys("ArrowRight", "ArrowUp"), cam.quaternion, cam.zoom, 1 / 60).length();
    expect(diagonal).toBeCloseTo(straight);
  });

  it("stays put when nothing pannable is held or the axes cancel", () => {
    const cam = boardCamera();
    const zero = new THREE.Vector3();
    expect(arrowPanStep(keys(), cam.quaternion, cam.zoom, 1 / 60)).toEqual(zero);
    expect(arrowPanStep(keys("Shift", "a"), cam.quaternion, cam.zoom, 1 / 60)).toEqual(zero);
    expect(arrowPanStep(keys("ArrowLeft", "ArrowRight"), cam.quaternion, cam.zoom, 1 / 60)).toEqual(zero);
    // A stalled frame (dt 0) or a nonsense zoom must not produce NaNs.
    expect(arrowPanStep(keys("ArrowUp"), cam.quaternion, cam.zoom, 0)).toEqual(zero);
    expect(arrowPanStep(keys("ArrowUp"), cam.quaternion, 0, 1 / 60)).toEqual(zero);
  });

  it("ignores a stale camera matrix", () => {
    // The regression: reading orientation off camera.matrix drifts, because the
    // matrix is only recomposed during the render pass — so in a useFrame
    // callback it still holds the PREVIOUS orientation (and at mount, whatever
    // the camera was constructed with). Here the matrix is deliberately left
    // pointing at the pre-orbit rig while the camera has already swung 90 deg;
    // the pan must follow the camera, not the matrix.
    const b = boardBounds(20, 20);
    const cam = boardCamera();
    cam.updateMatrixWorld(true); // matrix now says "no yaw"
    cam.position.set(b.cx + 8, LOOK_Y + 6, b.cz);
    cam.lookAt(b.cx, LOOK_Y, b.cz); // quaternion swings; matrix left stale on purpose

    const step = arrowPanStep(keys("ArrowRight"), cam.quaternion, cam.zoom, 1 / 60);
    expect(step.x).toBeCloseTo(0);
    expect(step.z).toBeLessThan(0);
  });

  it("reuses the caller's output vector", () => {
    const cam = boardCamera();
    const out = new THREE.Vector3();
    expect(arrowPanStep(keys("ArrowUp"), cam.quaternion, cam.zoom, 1 / 60, out)).toBe(out);
  });

  it("claims exactly the four arrow keys", () => {
    expect([...PAN_KEYS].sort()).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
  });
});

describe("clampPanStep", () => {
  const bounds = boardBounds(20, 20);

  const stepOf = (x: number, z: number) => new THREE.Vector3(x, 0, z);

  it("passes a step through untouched well inside the board", () => {
    const step = clampPanStep(stepOf(1.5, -2), bounds.cx, bounds.cz, bounds);
    expect(step.x).toBe(1.5);
    expect(step.z).toBe(-2);
  });

  it("stops the target exactly at the edge instead of overshooting", () => {
    // A big step from just inside the east edge: only the remaining gap is spent.
    const from = bounds.maxX - 0.75;
    const step = clampPanStep(stepOf(50, 0), from, bounds.cz, bounds);
    expect(step.x).toBeCloseTo(0.75);
    expect(from + step.x).toBeCloseTo(bounds.maxX);
    // ...and pressing again at the edge does nothing at all.
    expect(clampPanStep(stepOf(50, 0), bounds.maxX, bounds.cz, bounds).x).toBe(0);
    expect(clampPanStep(stepOf(-50, 0), bounds.minX, bounds.cz, bounds).x).toBe(0);
    expect(clampPanStep(stepOf(0, -50), bounds.cx, bounds.minZ, bounds).z).toBe(0);
    expect(clampPanStep(stepOf(0, 50), bounds.cx, bounds.maxZ, bounds).z).toBe(0);
  });

  it("still slides along an edge when a second key is held", () => {
    // Pinned against the west edge but also heading north: x stalls, z doesn't.
    const step = clampPanStep(stepOf(-3, -3), bounds.minX, bounds.cz, bounds);
    expect(step.x).toBe(0);
    expect(step.z).toBe(-3);
  });

  it("lets a target stranded outside the board come back but not go further", () => {
    // Right-drag pan and orbit aren't clamped, so the target can start outside.
    const stranded = bounds.maxX + 30;
    expect(clampPanStep(stepOf(5, 0), stranded, bounds.cz, bounds).x).toBe(0);
    // Heading home is allowed at full speed — no snapping, no teleport.
    expect(clampPanStep(stepOf(-5, 0), stranded, bounds.cz, bounds).x).toBe(-5);
    // And it can't be dragged clean through to the far side in one step.
    const far = clampPanStep(stepOf(-500, 0), stranded, bounds.cz, bounds);
    expect(stranded + far.x).toBeCloseTo(bounds.minX);
  });

  it("scales its limits with the board", () => {
    const big = boardBounds(96, 96);
    const atSmallEdge = stepOf(5, 0);
    expect(clampPanStep(atSmallEdge, bounds.maxX, bounds.cz, bounds).x).toBe(0);
    // The same spot is mid-field on a 96x96 board, so the step is free to run.
    expect(clampPanStep(stepOf(5, 0), bounds.maxX, bounds.cz, big).x).toBe(5);
  });
});

describe("boardClampOffset", () => {
  const bounds = boardBounds(20, 20);
  const at = (x: number, z: number) => new THREE.Vector3(x, LOOK_Y, z);

  it("leaves a target on the board alone", () => {
    expect(boardClampOffset(at(bounds.cx, bounds.cz), bounds)).toEqual(new THREE.Vector3());
    // Exactly on the boundary counts as on the board — no jitter at the limit.
    expect(boardClampOffset(at(bounds.maxX, bounds.maxZ), bounds)).toEqual(new THREE.Vector3());
    expect(boardClampOffset(at(bounds.minX, bounds.minZ), bounds)).toEqual(new THREE.Vector3());
  });

  it("hauls an escaped target back to the nearest edge", () => {
    // What a right-drag flung past the east edge gets corrected by.
    const target = at(bounds.maxX + 12, bounds.cz);
    const fix = boardClampOffset(target, bounds);
    expect(fix.x).toBeCloseTo(-12);
    expect(fix.z).toBe(0);
    expect(target.x + fix.x).toBeCloseTo(bounds.maxX);
    // ...and the same on each of the other three sides.
    expect(boardClampOffset(at(bounds.minX - 5, bounds.cz), bounds).x).toBeCloseTo(5);
    expect(boardClampOffset(at(bounds.cx, bounds.maxZ + 5), bounds).z).toBeCloseTo(-5);
    expect(boardClampOffset(at(bounds.cx, bounds.minZ - 5), bounds).z).toBeCloseTo(5);
  });

  it("corrects both axes at once and never the height", () => {
    const fix = boardClampOffset(at(bounds.maxX + 3, bounds.minZ - 4), bounds);
    expect(fix.x).toBeCloseTo(-3);
    expect(fix.z).toBeCloseTo(4);
    expect(fix.y).toBe(0); // sliding only — the iso rig's height must not shift
  });

  it("does not mutate the target it inspects", () => {
    const target = at(bounds.maxX + 9, bounds.cz);
    boardClampOffset(target, bounds);
    expect(target.x).toBeCloseTo(bounds.maxX + 9);
  });

  it("is idempotent — one correction is always enough", () => {
    // The change handler applies the fix without calling update(), so a second
    // pass must be a no-op or the clamp could ping-pong.
    const target = at(bounds.maxX + 40, bounds.minZ - 40);
    target.add(boardClampOffset(target, bounds));
    expect(boardClampOffset(target, bounds)).toEqual(new THREE.Vector3());
  });

  it("reuses the caller's output vector", () => {
    const out = new THREE.Vector3();
    expect(boardClampOffset(at(bounds.maxX + 1, bounds.cz), bounds, out)).toBe(out);
  });
});
