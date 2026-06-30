import * as THREE from "three";
import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade, weatherRange } from "../generation/proceduralEngine";
import { ring, fluting } from "../generation/primitives";

const C = MESH_CONTRACTS.atmosphere;
const HALF = C.footprint / 2;

const params = [
  { key: "domeRadius", label: "Dome radius", kind: "number", min: 0.3, max: 0.75, step: 0.01, default: 0.5 },
  { key: "domeSegments", label: "Dome segments", kind: "int", min: 4, max: 14, step: 1, default: 8 },
  { key: "drumHeight", label: "Core height", kind: "number", min: 0.2, max: 1.0, step: 0.02, default: 0.55 },
  { key: "pipes", label: "Pipe complexity", kind: "int", min: 0, max: 9, step: 1, default: 5 },
  { key: "vents", label: "Venting ports", kind: "int", min: 0, max: 8, step: 1, default: 4 },
  { key: "baseColor", label: "Metal tint", kind: "color", default: C.color },
] as const;

/**
 * Push a triangle (a, b, c) oriented so its face normal points away from the solid's
 * reference centroid (cx, cy, cz). Lets us hand-build closed convex parts (domes, tubes,
 * prisms) without tracking winding by hand — facet() then recomputes per-face normals.
 */
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

/** A capped cylinder (tube) between points a and b. Faces orient outward from the axis midpoint. */
function tube(
  P: number[], I: number[],
  a: [number, number, number], b: [number, number, number],
  r: number, sides: number, capA: boolean, capB: boolean,
): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  // any perpendicular to the axis
  let px = uy, py = -ux, pz = 0;
  if (Math.hypot(px, py, pz) < 1e-4) { px = 1; py = 0; pz = 0; }
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2;
  const ringA: number[] = [], ringB: number[] = [];
  for (let s = 0; s < sides; s++) {
    const ang = (s / sides) * Math.PI * 2;
    const ox = (px * Math.cos(ang) + qx * Math.sin(ang)) * r;
    const oy = (py * Math.cos(ang) + qy * Math.sin(ang)) * r;
    const oz = (pz * Math.cos(ang) + qz * Math.sin(ang)) * r;
    P.push(a[0] + ox, a[1] + oy, a[2] + oz); ringA.push(P.length / 3 - 1);
    P.push(b[0] + ox, b[1] + oy, b[2] + oz); ringB.push(P.length / 3 - 1);
  }
  for (let s = 0; s < sides; s++) {
    const sn = (s + 1) % sides;
    outQuad(P, I, ringA[s], ringB[s], ringB[sn], ringA[sn], cx, cy, cz);
  }
  if (capA) for (let s = 1; s < sides - 1; s++) outTri(P, I, ringA[0], ringA[s], ringA[s + 1], cx, cy, cz);
  if (capB) for (let s = 1; s < sides - 1; s++) outTri(P, I, ringB[0], ringB[s], ringB[s + 1], cx, cy, cz);
}

/** A faceted hemisphere (dome) sitting with its equator on `baseY`, centered at (cx, cz). */
function dome(P: number[], I: number[], cx: number, cz: number, baseY: number, r: number, lat: number, lon: number): void {
  const rings: number[][] = [];
  for (let i = 0; i < lat; i++) {
    const phi = (i / lat) * (Math.PI / 2);
    const y = baseY + Math.sin(phi) * r;
    const rr = Math.cos(phi) * r;
    const row: number[] = [];
    for (let s = 0; s < lon; s++) {
      const ang = (s / lon) * Math.PI * 2;
      P.push(cx + Math.cos(ang) * rr, y, cz + Math.sin(ang) * rr);
      row.push(P.length / 3 - 1);
    }
    rings.push(row);
  }
  P.push(cx, baseY + r, cz);
  const apex = P.length / 3 - 1;
  // sphere center as the outward reference
  for (let i = 0; i < lat - 1; i++) {
    for (let s = 0; s < lon; s++) {
      const sn = (s + 1) % lon;
      outQuad(P, I, rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s], cx, baseY, cz);
    }
  }
  const top = rings[lat - 1];
  for (let s = 0; s < lon; s++) {
    const sn = (s + 1) % lon;
    outTri(P, I, top[s], top[sn], apex, cx, baseY, cz);
  }
}

/**
 * Atmosphere plant: a faceted dome tech-core on a cylindrical drum, ringed by industrial
 * conduits that run down into the hex, with vent nozzles protruding from the dome. The dome
 * radius and segment count shape the main core (blocky at low segments, smooth at high); pipe
 * complexity sets how many external conduits stand around the base; venting ports add outward
 * nozzles — natural attach points for a venting effect. Base flush on Y = 0. Patina metal.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const domeR = p.domeRadius as number;
  const lon = Math.max(4, Math.round(p.domeSegments as number));
  const lat = Math.max(3, Math.round((p.domeSegments as number) * 0.6));
  const drumH = p.drumHeight as number;
  const pipeCount = Math.max(0, Math.round(p.pipes as number));
  const ventCount = Math.max(0, Math.round(p.vents as number));
  const baseColor = p.baseColor as string;
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  // Central drum (open top — the dome caps it) and the dome.
  tube(P, I, [0, 0, 0], [0, drumH, 0], domeR, lon, true, false);
  dome(P, I, 0, 0, drumH, domeR, lat, lon);

  // Vent nozzles: short tubes pushing outward from the dome at mid-latitude.
  for (let v = 0; v < ventCount; v++) {
    const ang = (v / Math.max(1, ventCount)) * Math.PI * 2 + rng() * 0.3;
    const phi = Math.PI * (0.18 + rng() * 0.22); // up the dome a little
    const rr = Math.cos(phi) * domeR;
    const y = drumH + Math.sin(phi) * domeR;
    const dirx = Math.cos(ang), dirz = Math.sin(ang);
    const inset = 0.9; // start just inside the shell so the nozzle reads as set into it
    const a: [number, number, number] = [dirx * rr * inset, y, dirz * rr * inset];
    const out = 0.1 + rng() * 0.06;
    const b: [number, number, number] = [dirx * (rr + out), y + 0.02, dirz * (rr + out)];
    tube(P, I, a, b, 0.045, 6, false, true);
  }

  // Conduits: vertical pipes standing around the core, running down into the hex. Placed on a
  // ring inside the footprint so the conformed footprint stays stable.
  const pipeRing = Math.min(HALF * 0.92, domeR + 0.22);
  for (let i = 0; i < pipeCount; i++) {
    const ang = (i / Math.max(1, pipeCount)) * Math.PI * 2 + 0.15;
    const px = Math.cos(ang) * pipeRing;
    const pz = Math.sin(ang) * pipeRing;
    const h = drumH * (0.7 + rng() * 0.6);
    const pr = 0.05 + rng() * 0.03;
    tube(P, I, [px, 0, pz], [px, h, pz], pr, 6, true, true);
    // Elbow connector back toward the drum near the top — adds industrial complexity.
    const tx = Math.cos(ang) * (domeR * 0.9);
    const tz = Math.sin(ang) * (domeR * 0.9);
    tube(P, I, [px, h, pz], [tx, Math.min(drumH, h), tz], pr * 0.8, 5, true, true);
  }

  // Deco ornamentation: cornice bands ringing the drum, with vertical chevron fluting up its
  // face at higher levels. Count/gauge scale with the global slider.
  if (orn > 0.05) {
    ring(P, I, 0, drumH * 0.96, 0, domeR * 1.04, 0.018 + 0.03 * orn, Math.max(12, lon), 5);
    ring(P, I, 0, drumH * 0.45, 0, domeR * 1.03, 0.014 + 0.024 * orn, Math.max(12, lon), 5);
    if (orn > 0.5) {
      fluting(P, I, drumH * 0.08, drumH * 0.9, domeR * 1.01, 0.018 + 0.018 * orn, Math.max(6, Math.round(lon)), 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  const faceted = facet(geo);
  applyVerticalGradient(faceted, shade(baseColor, 0.55), shade(baseColor, 1.15));
  weatherRange(faceted, 0, I.length, rng, 0.1); // seeded per-facet oxidation blotching
  return { kind: "mesh", geometry: faceted, color: baseColor };
}

export const atmosphereDef: ArtifactDef = {
  type: "atmosphere",
  label: "Atmosphere Plant",
  category: "buildings",
  output: "mesh",
  contract: "atmosphere",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "atmosphere",
  promptSeed:
    "low-poly stylized Martian atmosphere plant, domed industrial tech core on a drum with external pipes and vent ports, oxidized patina metal, matte, engraved-illustration look, game asset.",
};
