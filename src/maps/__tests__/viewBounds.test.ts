// What the map camera can see, and the limits that keep the board covering the
// canvas. The regression these guard: the board framed at half the size it could
// be, ringed by dead space on all four sides, and pannable further into it.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { containZoom, coverZoom, panLimits, visibleGroundRect } from "../viewBounds";
import { boardClampOffset } from "../panKeys";
import { boardBounds } from "../hexGrid";
import { LOOK_Y, camPosForTarget, ISO_ELEVATION_DEG } from "../../viewport/isoCamera";

const SIN_ELEV = Math.sin((ISO_ELEVATION_DEG * Math.PI) / 180);

/** The rig MapViewport builds, at a given canvas size and zoom. */
function boardCamera(width: number, height: number, zoom: number, cols = 20, rows = 20) {
  const b = boardBounds(cols, rows);
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -200, 200);
  cam.zoom = zoom;
  cam.position.set(...camPosForTarget(b.cx, LOOK_Y, b.cz));
  cam.lookAt(b.cx, LOOK_Y, b.cz);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

const target = (x: number, z: number) => new THREE.Vector3(x, LOOK_Y, z);

describe("coverZoom", () => {
  const board = boardBounds(20, 20);

  it("fills the canvas rather than fitting inside it", () => {
    const zoom = coverZoom(board, 1086, 800);
    const cam = boardCamera(1086, 800, zoom);
    const view = visibleGroundRect(cam)!;
    // Covering means the visible ground never exceeds the board on EITHER axis —
    // any excess is exactly the dead space this replaced.
    expect(view.maxX - view.minX).toBeLessThanOrEqual(board.width + 1e-6);
    expect(view.maxZ - view.minZ).toBeLessThanOrEqual(board.depth + 1e-6);
    // ...and it is tight: one axis is filled exactly, or it zoomed further than needed.
    const slackX = board.width - (view.maxX - view.minX);
    const slackZ = board.depth - (view.maxZ - view.minZ);
    expect(Math.min(slackX, slackZ)).toBeCloseTo(0, 6);
  });

  it("accounts for the rig's tilt squashing the board's depth on screen", () => {
    // A world Z unit is only sin(35 deg) of a pixel-per-unit, so a square board
    // needs MORE zoom vertically than horizontally for the same canvas. Ignoring
    // that is what left bands above and below a board that looked width-fitted.
    const square = boardBounds(20, 20);
    const zoom = coverZoom(square, 1000, 1000);
    expect(zoom).toBeCloseTo(1000 / (square.depth * SIN_ELEV));
    expect(zoom).toBeGreaterThan(1000 / square.width);
  });

  it("takes whichever axis is binding", () => {
    const board20 = boardBounds(20, 20);
    // Very wide, short canvas: width binds.
    expect(coverZoom(board20, 4000, 200)).toBeCloseTo(4000 / board20.width);
    // Very tall, narrow canvas: depth binds.
    expect(coverZoom(board20, 200, 4000)).toBeCloseTo(4000 / (board20.depth * SIN_ELEV));
  });

  it("scales with the board", () => {
    const small = coverZoom(boardBounds(8, 8), 1000, 800);
    const big = coverZoom(boardBounds(96, 96), 1000, 800);
    expect(big).toBeLessThan(small); // a bigger board needs less zoom to cover
    expect(big).toBeGreaterThan(0);
  });
});

describe("containZoom", () => {
  const board = boardBounds(20, 20);

  it("puts the whole board on screen", () => {
    const cam = boardCamera(1086, 800, containZoom(board, 1086, 800));
    const view = visibleGroundRect(cam)!;
    // The mirror of cover: the VIEW now contains the board rather than the other
    // way round, which is the whole point of being allowed to zoom out.
    expect(view.maxX - view.minX).toBeGreaterThanOrEqual(board.width - 1e-6);
    expect(view.maxZ - view.minZ).toBeGreaterThanOrEqual(board.depth - 1e-6);
    // Tight: the binding axis fits exactly, so it is the last zoom that shows
    // everything and no further.
    const slackX = view.maxX - view.minX - board.width;
    const slackZ = view.maxZ - view.minZ - board.depth;
    expect(Math.min(slackX, slackZ)).toBeCloseTo(0, 6);
  });

  it("sits below the cover zoom — that gap is the zoom-out room", () => {
    expect(containZoom(board, 1086, 800)).toBeLessThan(coverZoom(board, 1086, 800));
    // A canvas matching the board's own on-screen proportions has no gap: fill
    // and fit are the same framing, and there is simply nothing to zoom out to.
    const square = boardBounds(20, 20);
    const matched = [square.width * 20, square.depth * SIN_ELEV * 20] as const;
    expect(containZoom(square, ...matched)).toBeCloseTo(coverZoom(square, ...matched));
  });

  it("leaves the board centred once it no longer fills the view", () => {
    // Zoomed out past cover, both axes pin — so a zoomed-out board sits in the
    // middle with even margins instead of drifting into a corner.
    const cam = boardCamera(1086, 800, containZoom(board, 1086, 800));
    const limits = panLimits(cam, target(board.cx, board.cz), board)!;
    expect(limits.minX).toBeCloseTo(limits.maxX, 6);
    expect(limits.minZ).toBeCloseTo(limits.maxZ, 6);
  });
});

describe("visibleGroundRect", () => {
  it("grows as the camera zooms out", () => {
    const wide = visibleGroundRect(boardCamera(1000, 800, 10))!;
    const tight = visibleGroundRect(boardCamera(1000, 800, 40))!;
    expect(wide.maxX - wide.minX).toBeCloseTo((tight.maxX - tight.minX) * 4);
  });

  it("measures the ground, tilt included", () => {
    // 1000x1000 canvas at zoom 20: 50 world units across, but the tilt stretches
    // the same pixels over 50/sin(35 deg) units of depth.
    const view = visibleGroundRect(boardCamera(1000, 1000, 20))!;
    expect(view.maxX - view.minX).toBeCloseTo(50, 3);
    expect(view.maxZ - view.minZ).toBeCloseTo(50 / SIN_ELEV, 3);
  });

  it("returns null when the view is edge-on", () => {
    const b = boardBounds(20, 20);
    const cam = boardCamera(1000, 800, 20);
    cam.position.set(b.cx, 0, b.cz + 12); // dead level with the ground
    cam.lookAt(b.cx, 0, b.cz);
    cam.updateMatrixWorld(true);
    expect(visibleGroundRect(cam)).toBeNull();
  });
});

describe("panLimits", () => {
  const board = boardBounds(20, 20);

  it("stops the view at the board's edge, not the board's edge at the view's centre", () => {
    // Zoomed in: the visible patch is small, so there is room to roam — but only
    // enough that the patch itself stays on the board. The old bound let the
    // TARGET reach board.maxX, which put half a screen of black past it.
    const cam = boardCamera(1000, 800, 60);
    const view = visibleGroundRect(cam)!;
    const halfW = (view.maxX - view.minX) / 2;
    const limits = panLimits(cam, target(board.cx, board.cz), board)!;

    expect(limits.maxX).toBeLessThan(board.maxX);
    expect(limits.maxX).toBeCloseTo(board.maxX - halfW, 3);
    expect(limits.minX).toBeCloseTo(board.minX + halfW, 3);
  });

  it("keeps the board covering the canvas at the limit", () => {
    const cam = boardCamera(1000, 800, 60);
    const limits = panLimits(cam, target(board.cx, board.cz), board)!;
    // Walk the camera to each corner of its allowed range and confirm the view
    // is still entirely over the board — no black, whichever way you pan.
    for (const [x, z] of [
      [limits.minX, limits.minZ],
      [limits.maxX, limits.minZ],
      [limits.minX, limits.maxZ],
      [limits.maxX, limits.maxZ],
    ]) {
      const at = boardCamera(1000, 800, 60);
      at.position.set(...camPosForTarget(x, LOOK_Y, z));
      at.lookAt(x, LOOK_Y, z);
      at.updateMatrixWorld(true);
      const view = visibleGroundRect(at)!;
      expect(view.minX).toBeGreaterThanOrEqual(board.minX - 1e-3);
      expect(view.maxX).toBeLessThanOrEqual(board.maxX + 1e-3);
      expect(view.minZ).toBeGreaterThanOrEqual(board.minZ - 1e-3);
      expect(view.maxZ).toBeLessThanOrEqual(board.maxZ + 1e-3);
    }
  });

  it("pins panning entirely once the view outruns the board", () => {
    // Zoomed out past the fit: every position shows dead space, so the only
    // sensible one is centred — and there is nothing left to pan to.
    const cam = boardCamera(1000, 800, 2);
    const limits = panLimits(cam, target(board.cx, board.cz), board)!;
    expect(limits.minX).toBeCloseTo(limits.maxX, 6);
    expect(limits.minZ).toBeCloseTo(limits.maxZ, 6);
  });

  it("leaves exactly no slack at the cover zoom", () => {
    // At the floor the board fits the canvas on the binding axis, so that axis
    // has a single legal position while the other may still have room.
    const cam = boardCamera(1086, 800, coverZoom(board, 1086, 800));
    const limits = panLimits(cam, target(board.cx, board.cz), board)!;
    const spanX = limits.maxX - limits.minX;
    const spanZ = limits.maxZ - limits.minZ;
    expect(Math.min(spanX, spanZ)).toBeCloseTo(0, 3);
    expect(spanX).toBeGreaterThanOrEqual(-1e-6);
    expect(spanZ).toBeGreaterThanOrEqual(-1e-6);
  });

  it("gives a bigger board more room to roam", () => {
    const big = boardBounds(96, 96);
    const cam = boardCamera(1000, 800, 60);
    const small = panLimits(cam, target(board.cx, board.cz), board)!;
    const large = panLimits(cam, target(big.cx, big.cz), big)!;
    expect(large.maxX - large.minX).toBeGreaterThan(small.maxX - small.minX);
  });

  it("frames the board with no dead space on any side", () => {
    // The whole feature, end to end, at the size the bug was reported at: zoom
    // to cover, aim at the centroid the way IsoCamera does, then clamp.
    const cam = boardCamera(820, 810, coverZoom(board, 820, 810));
    const target = new THREE.Vector3(board.cx, LOOK_Y, board.cz);

    // Aiming alone isn't enough. The rig looks at LOOK_Y, above the ground it is
    // framing, so the ground under the screen centre sits north of the target —
    // and the top edge runs off the board. This is the band that was still
    // showing after the zoom was fixed.
    const framedOnly = visibleGroundRect(cam)!;
    expect(framedOnly.minZ).toBeLessThan(board.minZ);

    // Clamping through the pan limits slides it back by exactly that parallax.
    const fix = boardClampOffset(target, panLimits(cam, target, board)!);
    expect(fix.z).toBeGreaterThan(0);
    target.add(fix);
    cam.position.add(fix); // camera rides along, so the angle is untouched
    cam.updateMatrixWorld(true);

    const view = visibleGroundRect(cam)!;
    expect(view.minX).toBeGreaterThanOrEqual(board.minX - 1e-6);
    expect(view.maxX).toBeLessThanOrEqual(board.maxX + 1e-6);
    expect(view.minZ).toBeGreaterThanOrEqual(board.minZ - 1e-6);
    expect(view.maxZ).toBeLessThanOrEqual(board.maxZ + 1e-6);
    // Tight, not merely inside: the binding axis touches both board edges.
    expect(view.minZ).toBeCloseTo(board.minZ, 6);
    expect(view.maxZ).toBeCloseTo(board.maxZ, 6);
  });

  it("declines to guess when the view is edge-on", () => {
    const cam = boardCamera(1000, 800, 20);
    cam.position.set(board.cx, 0, board.cz + 12);
    cam.lookAt(board.cx, 0, board.cz);
    cam.updateMatrixWorld(true);
    expect(panLimits(cam, target(board.cx, board.cz), board)).toBeNull();
  });
});
