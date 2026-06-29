import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";

const C = MESH_CONTRACTS.ramparts;
const HALF = C.footprint / 2;
const APOTHEM = HALF * Math.cos(Math.PI / 6);
const PHI0 = Math.PI / 6; // pointy-top hex: corners at 30°, 90°, …

/** Distance from center to the hex edge at angle theta (matches the viewport hex footprint). */
function hexR(theta: number): number {
  const a = (((theta - PHI0) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
  return APOTHEM / Math.cos(a - Math.PI / 6);
}

const params = [
  { key: "height", label: "Wall height", kind: "number", min: 0.4, max: 1.0, step: 0.02, default: 0.7 },
  { key: "thickness", label: "Wall thickness", kind: "number", min: 0.08, max: 0.3, step: 0.01, default: 0.16 },
  { key: "crenFreq", label: "Crenellation frequency", kind: "int", min: 3, max: 14, step: 1, default: 7 },
  { key: "merlon", label: "Merlon height", kind: "number", min: 0, max: 0.4, step: 0.02, default: 0.22 },
  { key: "gateWidth", label: "Gate width", kind: "number", min: 0, max: 0.45, step: 0.01, default: 0.16 },
  { key: "buttress", label: "Buttress scale", kind: "number", min: 0, max: 1, step: 0.02, default: 0.5 },
  { key: "baseColor", label: "Stone color", kind: "color", default: C.color },
] as const;

/** Orient triangle (a,b,c) so its normal points away from reference (cx,cy,cz). */
function outTri(P: number[], I: number[], a: number, b: number, c: number, cx: number, cy: number, cz: number): void {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
  const dx = P[c * 3], dy = P[c * 3 + 1], dz = P[c * 3 + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = dx - ax, vy = dy - ay, vz = dz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (ax + bx + dx) / 3 - cx, my = (ay + by + dy) / 3 - cy, mz = (az + bz + dz) / 3 - cz;
  if (nx * mx + ny * my + nz * mz < 0) I.push(a, c, b);
  else I.push(a, b, c);
}

function outQuad(P: number[], I: number[], a: number, b: number, c: number, d: number, cx: number, cy: number, cz: number): void {
  outTri(P, I, a, b, c, cx, cy, cz);
  outTri(P, I, a, c, d, cx, cy, cz);
}

function vert(P: number[], x: number, y: number, z: number): number {
  P.push(x, y, z);
  return P.length / 3 - 1;
}

/**
 * One closed wall block spanning the perimeter arc [t0, t1] (fractions of the full loop),
 * from the inner radius to the hex edge, rising to height `h`. Built as a convex prism so
 * neighbouring blocks of differing height read as crenellated battlements automatically.
 */
function wallBlock(P: number[], I: number[], t0: number, t1: number, thick: number, h: number): void {
  const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
  const rO0 = hexR(a0), rO1 = hexR(a1);
  const rI0 = Math.max(0.02, rO0 - thick), rI1 = Math.max(0.02, rO1 - thick);
  const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
  const ob0 = vert(P, c0 * rO0, 0, s0 * rO0);
  const ob1 = vert(P, c1 * rO1, 0, s1 * rO1);
  const ib1 = vert(P, c1 * rI1, 0, s1 * rI1);
  const ib0 = vert(P, c0 * rI0, 0, s0 * rI0);
  const ot0 = vert(P, c0 * rO0, h, s0 * rO0);
  const ot1 = vert(P, c1 * rO1, h, s1 * rO1);
  const it1 = vert(P, c1 * rI1, h, s1 * rI1);
  const it0 = vert(P, c0 * rI0, h, s0 * rI0);
  // block centroid as outward reference
  let cx = 0, cy = 0, cz = 0;
  for (const v of [ob0, ob1, ib1, ib0, ot0, ot1, it1, it0]) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
  cx /= 8; cy /= 8; cz /= 8;
  outQuad(P, I, ob0, ob1, ot1, ot0, cx, cy, cz); // outer
  outQuad(P, I, ib0, ib1, it1, it0, cx, cy, cz); // inner
  outQuad(P, I, ot0, ot1, it1, it0, cx, cy, cz); // top
  outQuad(P, I, ob0, ob1, ib1, ib0, cx, cy, cz); // bottom
  outQuad(P, I, ob0, ot0, it0, ib0, cx, cy, cz); // end t0
  outQuad(P, I, ob1, ot1, it1, ib1, cx, cy, cz); // end t1
}

/** An angled buttress: a triangular-section support leaning against the outer wall at theta. */
function buttress(P: number[], I: number[], theta: number, hTop: number, extend: number, halfW: number): void {
  const rO = hexR(theta);
  const dirx = Math.cos(theta), dirz = Math.sin(theta);
  const tanx = -Math.sin(theta), tanz = Math.cos(theta);
  // cross-section (radial r, height y): top against wall, foot splayed outward
  const sec: [number, number][] = [
    [rO - 0.02, hTop],   // top, tucked into the wall
    [rO - 0.02, 0],      // foot at wall base
    [rO + extend, 0],    // foot splayed out on the ground
  ];
  const at = (r: number, y: number, s: number): number =>
    vert(P, dirx * r + tanx * s, y, dirz * r + tanz * s);
  const front = sec.map(([r, y]) => at(r, y, halfW));
  const back = sec.map(([r, y]) => at(r, y, -halfW));
  const cx = dirx * rO, cy = hTop / 3, cz = dirz * rO;
  outTri(P, I, front[0], front[1], front[2], cx, cy + 0.3, cz); // front cap (bias ref outward)
  outTri(P, I, back[0], back[1], back[2], cx, cy + 0.3, cz);    // back cap
  outQuad(P, I, front[0], back[0], back[1], front[1], cx, cy, cz); // wall side
  outQuad(P, I, front[1], back[1], back[2], front[2], cx, cy, cz); // bottom
  outQuad(P, I, front[2], back[2], back[0], front[0], cx, cy, cz); // sloped outer face
}

/**
 * A deco cornice string-course block over perimeter arc [t0, t1]: a thin prism between y0 and
 * y1 that projects `lip` proud of the hex edge, so a continuous banded ledge wraps the wall.
 */
function corniceBlock(
  P: number[], I: number[],
  t0: number, t1: number, y0: number, y1: number, lip: number, inset: number,
): void {
  const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
  const rO0 = hexR(a0) + lip, rO1 = hexR(a1) + lip;
  const rI0 = Math.max(0.02, hexR(a0) - inset), rI1 = Math.max(0.02, hexR(a1) - inset);
  const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
  const ob0 = vert(P, c0 * rO0, y0, s0 * rO0), ob1 = vert(P, c1 * rO1, y0, s1 * rO1);
  const ib1 = vert(P, c1 * rI1, y0, s1 * rI1), ib0 = vert(P, c0 * rI0, y0, s0 * rI0);
  const ot0 = vert(P, c0 * rO0, y1, s0 * rO0), ot1 = vert(P, c1 * rO1, y1, s1 * rO1);
  const it1 = vert(P, c1 * rI1, y1, s1 * rI1), it0 = vert(P, c0 * rI0, y1, s0 * rI0);
  let cx = 0, cy = 0, cz = 0;
  for (const v of [ob0, ob1, ib1, ib0, ot0, ot1, it1, it0]) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
  cx /= 8; cy /= 8; cz /= 8;
  outQuad(P, I, ob0, ob1, ot1, ot0, cx, cy, cz); // outer
  outQuad(P, I, ib0, ib1, it1, it0, cx, cy, cz); // inner
  outQuad(P, I, ot0, ot1, it1, it0, cx, cy, cz); // top
  outQuad(P, I, ob0, ob1, ib1, ib0, cx, cy, cz); // bottom
  outQuad(P, I, ob0, ot0, it0, ib0, cx, cy, cz); // end t0
  outQuad(P, I, ob1, ot1, it1, ib1, cx, cy, cz); // end t1
}

/**
 * Walled-city ramparts: a crenellated hexagonal perimeter wall with real thickness, broken by
 * a central gate and braced by angled buttresses. Crenellation frequency sets the merlon count
 * around the crown; gate width opens a gap on the +X edge for low-altitude flyers to thread;
 * buttress scale grows the outward supports (0 removes them). Base flush on Y = 0. Sandstone.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const wallH = p.height as number;
  const thick = p.thickness as number;
  const crenFreq = Math.max(1, Math.round(p.crenFreq as number));
  const merlon = (p.merlon as number) * wallH;
  const gateFrac = p.gateWidth as number; // gap as a fraction of the full loop
  const buttressScale = p.buttress as number;
  const baseColor = p.baseColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  // Two perimeter samples per merlon and per crenel so battlements land on block boundaries.
  const blocks = crenFreq * 4;
  const gateCenter = 0; // +X edge
  for (let k = 0; k < blocks; k++) {
    const t0 = k / blocks;
    const t1 = (k + 1) / blocks;
    const tc = (t0 + t1) / 2;
    // shortest distance from the gate center, as a fraction of the loop
    let d = Math.abs(tc - gateCenter);
    d = Math.min(d, 1 - d);
    if (d < gateFrac / 2) continue; // open the gate
    const isMerlon = Math.floor(k / 2) % 2 === 0;
    const h = wallH + (isMerlon ? merlon : 0) + (rng() - 0.5) * 0.02;
    wallBlock(P, I, t0, t1, thick, h);
  }

  // Buttresses at the hex corners (skip any that fall in the gate gap).
  if (buttressScale > 0) {
    const extend = 0.06 + buttressScale * 0.16;
    const halfW = 0.05 + buttressScale * 0.08;
    const hTop = wallH * (0.55 + buttressScale * 0.25);
    for (let cnr = 0; cnr < 6; cnr++) {
      const theta = PHI0 + (cnr / 6) * Math.PI * 2;
      let tc = (theta / (Math.PI * 2)) % 1; if (tc < 0) tc += 1;
      let d = Math.abs(tc - gateCenter); d = Math.min(d, 1 - d);
      if (d < gateFrac / 2 + 0.04) continue;
      buttress(P, I, theta, hTop, extend, halfW);
    }
  }

  // Deco ornamentation: a cornice string-course banding the wall below the merlons, with a
  // second lower course at higher levels. Skips the gate gap; lip/courses scale with the slider.
  if (orn > 0.05) {
    const lip = 0.02 + 0.04 * orn;
    const courseT = 0.04 + 0.04 * orn;
    const courses = orn > 0.5 ? [wallH * 0.62, wallH * 0.3] : [wallH * 0.62];
    for (const cy of courses) {
      for (let k = 0; k < blocks; k++) {
        const t0 = k / blocks, t1 = (k + 1) / blocks, tc = (t0 + t1) / 2;
        let d = Math.abs(tc - gateCenter); d = Math.min(d, 1 - d);
        if (d < gateFrac / 2) continue;
        corniceBlock(P, I, t0, t1, cy, cy + courseT, lip, thick * 0.6);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  const faceted = facet(geo);
  applyVerticalGradient(faceted, shade(baseColor, 0.62), shade(baseColor, 1.08));
  return { kind: "mesh", geometry: faceted, color: baseColor };
}

export const rampartsDef: ArtifactDef = {
  type: "ramparts",
  label: "City Ramparts",
  category: "buildings",
  output: "mesh",
  contract: "ramparts",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "ramparts",
  promptSeed:
    "low-poly stylized Martian walled-city ramparts, crenellated stone perimeter wall with a central gate and angled buttresses, sun-bleached sandstone, matte, engraved-illustration look, game asset.",
};
