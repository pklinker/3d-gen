// The dish-facing regression: a reflector built as one open cone disappears when viewed from
// the side it points at, because every face of a cone aims away from its own concavity and
// backface culling removes the lot. Pure geometry, no renderer.

import { describe, expect, it } from "vitest";
import { bowl, frustum } from "../primitives";
import { ARTIFACTS } from "../../artifacts/registry";
import { defaultParams } from "../../types";
import { MESH_CONTRACTS } from "../../contract/constants";

const BACK: [number, number, number] = [0, 0, 0];
const RIM: [number, number, number] = [1, 0, 0];

/**
 * Total triangle area facing the camera, for a camera looking down -X at the mouth of a
 * shape built along +X. A face is visible when its winding normal has a positive X.
 */
function areaFacing(P: number[], I: number[], axis: [number, number, number]): number {
  let sum = 0;
  for (let i = 0; i + 2 < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const dot = nx * axis[0] + ny * axis[1] + nz * axis[2];
    if (dot > 0) sum += dot / 2; // |n|/2 is the area; the dot is that projected onto the view
  }
  return sum;
}

describe("bowl", () => {
  it("presents no surface at all to a camera in front of an open cone", () => {
    // The bug, pinned: this is what the radar dish used to be built from.
    const P: number[] = [], I: number[] = [];
    frustum(P, I, BACK, RIM, 0.1, 0.5, 14, true, false);
    expect(areaFacing(P, I, [1, 0, 0])).toBeCloseTo(0, 6);
  });

  it("presents its pan to a camera in front", () => {
    const P: number[] = [], I: number[] = [];
    bowl(P, I, BACK, RIM, 0.1, 0.5, 14, 0.04);
    // The inner pan alone projects to nearly the full mouth disk (pi * 0.46^2 = 0.66), minus
    // the inner floor it cannot see past. Well clear of "a stray face or two".
    expect(areaFacing(P, I, [1, 0, 0])).toBeGreaterThan(0.5);
  });

  it("still presents its back to a camera behind", () => {
    const P: number[] = [], I: number[] = [];
    bowl(P, I, BACK, RIM, 0.1, 0.5, 14, 0.04);
    // Adding the inner surface must not have cost the outer one: the back cap plus the
    // convex flank still cover the silhouette from behind.
    expect(areaFacing(P, I, [-1, 0, 0])).toBeGreaterThan(0.5);
  });

  it("keeps the radar dish inside its triangle budget", () => {
    const def = ARTIFACTS.find((d) => d.type === "radarDish")!;
    const out = def.generate(1234, defaultParams(def.params));
    const geo = out.kind === "mesh" ? out.geometry : null;
    const tris = geo!.getAttribute("position").count / 3;
    expect(tris).toBeLessThanOrEqual(MESH_CONTRACTS.radarDish.triBudget);
  });
});
