// Pointer -> hex picking for the Maps painter. The regression this guards: painting silently
// did nothing over the bottom ~6 rows of a 20x20 board.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { hexAtPointer, ndcOf } from "../picking";
import { axialToWorld, boardBounds, fieldCells } from "../hexGrid";
import { LOOK_Y, camPosForTarget } from "../../viewport/isoCamera";

const COLS = 20;
const ROWS = 20;
// The centre pane at a 1280x720 window — the size the bug was reported at.
const CANVAS_W = 660;
const CANVAS_H = 673.5;

/** The exact camera MapViewport builds: orthographic, iso rig, framed on the board. */
function boardCamera(cols = COLS, rows = ROWS): THREE.OrthographicCamera {
  const b = boardBounds(cols, rows);
  const zoom = Math.max(4, Math.min(400, 650 / Math.max(b.width, b.depth, 1)));
  const cam = new THREE.OrthographicCamera(-CANVAS_W / 2, CANVAS_W / 2, CANVAS_H / 2, -CANVAS_H / 2, -200, 200);
  cam.zoom = zoom;
  cam.position.set(...camPosForTarget(b.cx, LOOK_Y, b.cz));
  cam.lookAt(b.cx, LOOK_Y, b.cz);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Screen-project a ground point, then feed it back through the picker. */
function pickAtGroundPoint(cam: THREE.OrthographicCamera, x: number, z: number) {
  const ndc = new THREE.Vector3(x, 0, z).project(cam);
  return hexAtPointer(cam, ndc.x, ndc.y);
}

describe("hexAtPointer", () => {
  it("resolves every cell of the board, including the bottom rows", () => {
    // The bug in one assertion: rows 14-19 sit low enough on screen that the old pick-mesh
    // raycast dropped them entirely. Nothing about a cell's screen position should matter.
    const cam = boardCamera();
    const misses: string[] = [];
    for (const { q, r } of fieldCells(COLS, ROWS)) {
      const { x, z } = axialToWorld(q, r);
      const hit = pickAtGroundPoint(cam, x, z);
      if (!hit || hit.q !== q || hit.r !== r) misses.push(`${q},${r} -> ${hit ? `${hit.q},${hit.r}` : "null"}`);
    }
    expect(misses).toEqual([]);
  });

  it("keeps working when the camera is orbited shallow", () => {
    // A shallower angle pushes the board further down the screen — the regime that made the
    // old dead band grow from ~2 rows to ~6.
    const b = boardBounds(COLS, ROWS);
    const cam = boardCamera();
    cam.position.set(b.cx, LOOK_Y + 2.5, b.cz + 12);
    cam.lookAt(b.cx, LOOK_Y, b.cz);
    cam.updateMatrixWorld(true);
    const misses: string[] = [];
    for (const { q, r } of fieldCells(COLS, ROWS)) {
      const { x, z } = axialToWorld(q, r);
      const hit = pickAtGroundPoint(cam, x, z);
      if (!hit || hit.q !== q || hit.r !== r) misses.push(`${q},${r} -> ${hit ? `${hit.q},${hit.r}` : "null"}`);
    }
    expect(misses).toEqual([]);
  });

  it("returns null only when the view is edge-on", () => {
    const b = boardBounds(COLS, ROWS);
    const cam = boardCamera();
    cam.position.set(b.cx, 0, b.cz + 12); // dead level with the ground
    cam.lookAt(b.cx, 0, b.cz);
    cam.updateMatrixWorld(true);
    expect(hexAtPointer(cam, 0, 0)).toBeNull();
  });

  it("puts the pick ray's own origin below the board's low rows — why no pick mesh works", () => {
    // Root cause, pinned. `near: -200` makes three.js start the ray at NDC z = 0, the plane
    // through the camera; that plane tilts with the screen and sinks under the board toward
    // the bottom of the viewport. Any pick mesh at y=0 or y=3 is then BEHIND the ray origin,
    // where Raycaster's `near = 0` throws the hit away. Analytic intersection has no such
    // notion of "behind".
    const cam = boardCamera();
    const { x, z } = axialToWorld(10, 19); // a bottom-row cell
    const ndc = new THREE.Vector3(x, 0, z).project(cam);
    const origin = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam);
    expect(origin.y).toBeLessThan(0);
    // ...and it still picks that exact cell.
    expect(hexAtPointer(cam, ndc.x, ndc.y)).toEqual({ q: 10, r: 19 });
  });

  it("maps client coords to NDC across the canvas", () => {
    const rect = { left: 300, top: 46.5, width: CANVAS_W, height: CANVAS_H } as DOMRect;
    expect(ndcOf(300, 46.5, rect)).toEqual([-1, 1]);
    expect(ndcOf(300 + CANVAS_W, 46.5 + CANVAS_H, rect)).toEqual([1, -1]);
    const [cx, cy] = ndcOf(300 + CANVAS_W / 2, 46.5 + CANVAS_H / 2, rect);
    expect(cx).toBeCloseTo(0);
    expect(cy).toBeCloseTo(0);
  });
});
