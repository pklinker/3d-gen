import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  outQuad, tube, dome, frustum, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.pumpStation;
const H = C.height; // 1.0

const params = [
  { key: "arch", label: "Canal arch width", kind: "number", min: 0.3, max: 0.66, step: 0.02, default: 0.48 },
  { key: "pipe", label: "Pipe gauge", kind: "number", min: 0.04, max: 0.12, step: 0.005, default: 0.07 },
  { key: "flute", label: "Dome fluting", kind: "int", min: 0, max: 12, step: 1, default: 6 },
  { key: "orbs", label: "Observation orbs", kind: "int", min: 0, max: 4, step: 1, default: 2 },
] as const;

/**
 * A stone block straddling the canal with a semicircular tunnel bored along Z (water flows
 * through, so the two tunnel mouths are left open). Built as a rectangle-with-arched-hole on
 * each Z face, a curved soffit joining them, plus outer walls and the two pier floors. The
 * arch springs from the floor; `archR` is its radius (half the canal arch width).
 */
function tunnelBlock(
  P: number[], I: number[],
  bx: number, bz: number, topY: number, archR: number, seg: number,
): void {
  const solidRef: [number, number, number] = [0, topY + 0.3, 0]; // up in the masonry
  // Arc points (right springing -> crown -> left springing) on each Z face.
  const arc = (z: number): number[] => {
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI;
      P.push(Math.cos(th) * archR, Math.sin(th) * archR, z);
      idx.push(P.length / 3 - 1);
    }
    return idx;
  };
  const v = (x: number, y: number, z: number): number => { P.push(x, y, z); return P.length / 3 - 1; };

  for (const z of [bz, -bz]) {
    const ns: [number, number, number] = [0, topY / 2, 0]; // building centre — ensures Z faces orient outward
    const a = arc(z);
    // left + right + top panels
    const lbl = v(-bx, 0, z), ltl = v(-bx, topY, z), ltr = v(-archR, topY, z);
    outQuad(P, I, lbl, a[seg], ltr, ltl, ns[0], ns[1], ns[2]);
    const rbr = v(bx, 0, z), rtr = v(bx, topY, z), rtl = v(archR, topY, z);
    outQuad(P, I, a[0], rbr, rtr, rtl, ns[0], ns[1], ns[2]);
    outQuad(P, I, ltr, v(archR, topY, z), v(archR, archR, z), v(-archR, archR, z), ns[0], ns[1], ns[2]);
    // haunch strip: arc up to the y = archR line
    for (let i = 0; i < seg; i++) {
      const xi = Math.cos((i / seg) * Math.PI) * archR;
      const xn = Math.cos(((i + 1) / seg) * Math.PI) * archR;
      const u0 = v(xi, archR, z), u1 = v(xn, archR, z);
      outQuad(P, I, a[i], a[i + 1], u1, u0, ns[0], ns[1], ns[2]);
    }
  }
  // Soffit: connect the front arc to the back arc (faces into the tunnel).
  const front = arc(bz), back = arc(-bz);
  for (let i = 0; i < seg; i++) {
    outQuad(P, I, front[i], front[i + 1], back[i + 1], back[i], solidRef[0], solidRef[1], solidRef[2]);
  }
  // Outer shell: top, left, right walls + the two pier floors.
  const c: [number, number, number] = [0, topY / 2, 0];
  const TL = v(-bx, topY, -bz), TR = v(bx, topY, -bz), TR2 = v(bx, topY, bz), TL2 = v(-bx, topY, bz);
  outQuad(P, I, TL, TR, TR2, TL2, c[0], c[1], c[2]); // top
  outQuad(P, I, v(-bx, 0, -bz), v(-bx, topY, -bz), v(-bx, topY, bz), v(-bx, 0, bz), c[0], c[1], c[2]); // left
  outQuad(P, I, v(bx, 0, -bz), v(bx, topY, -bz), v(bx, topY, bz), v(bx, 0, bz), c[0], c[1], c[2]); // right
  outQuad(P, I, v(-bx, 0, -bz), v(-archR, 0, -bz), v(-archR, 0, bz), v(-bx, 0, bz), c[0], c[1], c[2]); // floor L
  outQuad(P, I, v(archR, 0, -bz), v(bx, 0, -bz), v(bx, 0, bz), v(archR, 0, bz), c[0], c[1], c[2]); // floor R
}

/**
 * Water Inflow Pumping Station: an ornate domed stone house built over a grand canal. A
 * vaulted archway is bored through the base for the water; a fluted observation dome crowns
 * the block, ribbed with vertical fins (count from the slider); heavy external conduits snake
 * out of the sides and down into the hex (thickness from the pipe gauge); small glass
 * observation orbs perch on the roof. Weathered canal stone with bright glass and metal pipes.
 */
function generate(_seed: number, p: ParamValues): GeneratedMesh {
  const archR = (p.arch as number) / 2;
  const gauge = p.pipe as number;
  const flute = Math.max(0, Math.round(p.flute as number));
  const orbCount = Math.max(0, Math.round(p.orbs as number));
  const orn = (p.ornament as number) ?? 0;

  const P: number[] = [];
  const I: number[] = [];

  const bx = 0.78, bz = 0.42, topY = 0.5;
  tunnelBlock(P, I, bx, bz, topY, archR, 8);

  // Crowning dome (the observation hall).
  const domeR = 0.42;
  dome(P, I, 0, 0, topY, domeR, 6, 12);
  const domeTop = topY + domeR;

  // Dome fluting: thin vertical ribs following the dome meridians (metal).
  const ribStart = I.length;
  for (let i = 0; i < flute; i++) {
    const ang = (i / flute) * Math.PI * 2;
    const x = Math.cos(ang), z = Math.sin(ang);
    const r = 0.012 + 0.012 * orn;
    frustum(P, I, [x * domeR * 0.98, topY + 0.02, z * domeR * 0.98], [x * domeR * 0.4, domeTop - 0.03, z * domeR * 0.4], r, r, 4, false, false);
  }
  // Finial mast to the full height.
  tube(P, I, [0, domeTop - 0.02, 0], [0, H, 0], 0.02, 5, false, true);
  const ribEnd = I.length;

  // Heavy external conduits: a thick pipe out of each side, elbowed down into the hex.
  const pipeStart = I.length;
  for (const sgn of [-1, 1]) {
    const y = topY * 0.5;
    const sx = sgn * bx;
    tube(P, I, [sx, y, 0], [sgn * (bx + 0.06), y, 0], gauge, 8, true, false);
    tube(P, I, [sgn * (bx + 0.06), y, 0], [sgn * (bx + 0.06), 0, 0], gauge, 8, false, true);
  }
  // A back conduit running out along -Z.
  tube(P, I, [0, topY * 0.6, -bz], [0, topY * 0.6, -bz - 0.05], gauge * 0.9, 8, true, false);
  tube(P, I, [0, topY * 0.6, -bz - 0.05], [0, 0, -bz - 0.05], gauge * 0.9, 8, false, true);
  const pipeEnd = I.length;

  // Glass observation orbs on the roof corners.
  const orbStart = I.length;
  for (let i = 0; i < orbCount; i++) {
    const ang = (i / Math.max(1, orbCount)) * Math.PI * 2 + 0.6;
    const ox = Math.cos(ang) * domeR * 1.05, oz = Math.sin(ang) * domeR * 1.05;
    dome(P, I, ox, oz, topY + 0.02, 0.08, 4, 8);
  }
  const orbEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.6), shade(C.color, 1.12));
  paintRange(geo, ribStart, ribEnd, "#7E8890", 0.85); // fluting + finial: metal
  paintRange(geo, pipeStart, pipeEnd, "#6E7B73", 0.9); // conduits: patina metal
  paintRange(geo, orbStart, orbEnd, "#7FC8E0", 0.8); // glass orbs
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const pumpStationDef: ArtifactDef = {
  type: "pumpStation",
  label: "Pumping Station",
  category: "buildings",
  output: "mesh",
  contract: "pumpStation",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "pump_station",
  promptSeed:
    "low-poly ornate Martian canal pumping station, domed stone house over a vaulted water archway, ribbed dome, heavy external pipes and glass observation orbs, retro-futuristic, matte, stylized game asset.",
};
