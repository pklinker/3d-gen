import type { ArtifactDef, GeneratedMesh, ParamValues } from "../types";
import { MESH_CONTRACTS } from "../contract/constants";
import { makeRng, facet, applyVerticalGradient, shade } from "../generation/proceduralEngine";
import {
  box, tube, frustum, outTri, outQuad, paintRange, buildGeometry,
} from "../generation/primitives";

const C = MESH_CONTRACTS.landingStage;
const HALF = C.footprint / 2; // 0.9
const H = C.height; // 1.0

const params = [
  { key: "tiers", label: "Step count / tiers", kind: "int", min: 2, max: 6, step: 1, default: 4 },
  { key: "platform", label: "Platform extension", kind: "number", min: 0.4, max: 0.85, step: 0.02, default: 0.66 },
  { key: "gantry", label: "Gantry complexity", kind: "int", min: 0, max: 5, step: 1, default: 3 },
  { key: "posts", label: "Mooring posts", kind: "int", min: 0, max: 6, step: 1, default: 4 },
] as const;

/**
 * A pointy-top hexagonal prism (circumradius `r`, between y0 and y1) matching the viewport's
 * cell hex — used for the stepped tiers when the hex boundary mask is on, so the footprint
 * conforms to the hex instead of poking its square corners past the cell edges.
 */
function hexPrism(P: number[], I: number[], r: number, y0: number, y1: number): void {
  const bot: number[] = [], top: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * (Math.PI / 3);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    P.push(x, y0, z); bot.push(P.length / 3 - 1);
    P.push(x, y1, z); top.push(P.length / 3 - 1);
  }
  const cy = (y0 + y1) / 2;
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    outQuad(P, I, bot[i], bot[j], top[j], top[i], 0, cy, 0);
  }
  for (let i = 1; i < 5; i++) outTri(P, I, top[0], top[i], top[i + 1], 0, cy, 0); // top cap
  for (let i = 1; i < 5; i++) outTri(P, I, bot[0], bot[i], bot[i + 1], 0, cy, 0); // bottom cap
}

/**
 * Fleet Landing Stage: a heavy stepped stone pedestal crowned by a flared octagonal metal
 * landing platform for berthing larger warships. Square stone tiers corbel inward to the
 * platform; the platform flares back out and is repainted metal. Mooring posts stand around
 * the rim (and guarantee the full berth height), and an optional lattice gantry crane —
 * legs, diagonals and an overhanging jib — bolts to one side, scaling with the slider.
 */
function generate(seed: number, p: ParamValues): GeneratedMesh {
  const rng = makeRng(seed);
  const tiers = Math.max(2, Math.round(p.tiers as number));
  const platformR = p.platform as number;
  const gantry = Math.max(0, Math.round(p.gantry as number));
  const postCount = Math.max(0, Math.round(p.posts as number));
  const orn = (p.ornament as number) ?? 0;
  const fitHex = (p.fitToHex as boolean) ?? false;

  const P: number[] = [];
  const I: number[] = [];

  // Stepped stone pyramid: square tiers from base (HALF) corbelling in to the platform seat.
  const pyramidTopY = H * 0.6;
  const stepH = pyramidTopY / tiers;
  const topTierHalf = 0.36;
  for (let k = 0; k < tiers; k++) {
    const t = tiers === 1 ? 0 : k / (tiers - 1);
    const half = HALF + (topTierHalf - HALF) * t;
    const ly = (k + 1) * stepH;
    if (fitHex) {
      hexPrism(P, I, half, k * stepH, ly + 0.001);
    } else {
      box(P, I, -half, half, k * stepH, ly + 0.001, -half, half);
    }
    // Ornament: a thin overhanging cornice lip on each step edge.
    if (orn > 0.05) {
      const lip = half * (1 + 0.04 + 0.05 * orn);
      if (fitHex) {
        hexPrism(P, I, lip, ly - 0.015 - 0.02 * orn, ly);
      } else {
        box(P, I, -lip, lip, ly - 0.015 - 0.02 * orn, ly, -lip, lip);
      }
    }
  }

  // Flared octagonal metal landing platform on top of the stone seat (painted metal).
  const metalStart = I.length;
  const plateThick = 0.1;
  frustum(P, I, [0, pyramidTopY, 0], [0, pyramidTopY + plateThick, 0], topTierHalf * 0.95, platformR, 8, true, true, Math.PI / 8);
  const platformY = pyramidTopY + plateThick;

  // Mooring posts around the platform rim — also set the full berth height.
  for (let i = 0; i < postCount; i++) {
    const a = (i / Math.max(1, postCount)) * Math.PI * 2 + 0.2;
    const pr = platformR * 0.82;
    const px = Math.cos(a) * pr, pz = Math.sin(a) * pr;
    const topY = H - 0.02 - rng() * 0.05;
    tube(P, I, [px, platformY, pz], [px, topY, pz], 0.04, 6, false, true);
    tube(P, I, [px, topY - 0.05, pz], [px, topY, pz], 0.06, 6, false, true); // capital
  }
  const metalEnd = I.length;

  // Lattice gantry crane on the +X side: vertical legs, diagonal cross-braces, jib arm.
  const steelStart = I.length;
  if (gantry > 0) {
    const gx = HALF * 0.74;
    const legZ = 0.16;
    const gh = H - 0.04;
    const legR = 0.028;
    const z0 = -legZ, z1 = legZ;
    tube(P, I, [gx - 0.05, 0, z0], [gx - 0.05, gh, z0], legR, 4, true, true);
    tube(P, I, [gx - 0.05, 0, z1], [gx - 0.05, gh, z1], legR, 4, true, true);
    tube(P, I, [gx + 0.05, 0, z0], [gx + 0.05, gh, z0], legR, 4, true, true);
    tube(P, I, [gx + 0.05, 0, z1], [gx + 0.05, gh, z1], legR, 4, true, true);
    const rungs = 1 + gantry;
    for (let r = 0; r <= rungs; r++) {
      const y = (r / rungs) * gh;
      tube(P, I, [gx - 0.05, y, z0], [gx - 0.05, y, z1], legR * 0.6, 4, false, false);
      tube(P, I, [gx + 0.05, y, z0], [gx + 0.05, y, z1], legR * 0.6, 4, false, false);
      tube(P, I, [gx - 0.05, y, z0], [gx + 0.05, y, z0], legR * 0.6, 4, false, false);
    }
    // diagonals
    for (let r = 0; r < rungs; r++) {
      const ya = (r / rungs) * gh, yb = ((r + 1) / rungs) * gh;
      tube(P, I, [gx - 0.05, ya, z0], [gx + 0.05, yb, z0], legR * 0.5, 4, false, false);
    }
    // jib arm overhanging the platform
    tube(P, I, [gx, gh, 0], [topTierHalf * 0.5, gh, 0], legR * 0.9, 5, true, true);
    tube(P, I, [topTierHalf * 0.5, gh, 0], [topTierHalf * 0.5, gh - 0.22, 0], legR * 0.5, 4, true, true); // hook line
  }
  const steelEnd = I.length;

  const geo = facet(buildGeometry(P, I));
  applyVerticalGradient(geo, shade(C.color, 0.62), shade(C.color, 1.08));
  paintRange(geo, metalStart, metalEnd, "#8E97A2", 0.85); // platform + posts: pale steel
  paintRange(geo, steelStart, steelEnd, "#6F757C", 0.9); // gantry: darker iron
  return { kind: "mesh", geometry: geo, color: C.color };
}

export const landingStageDef: ArtifactDef = {
  type: "landingStage",
  label: "Fleet Landing Stage",
  category: "buildings",
  output: "mesh",
  contract: "landingStage",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "landing_stage",
  promptSeed:
    "low-poly Martian fleet landing stage, heavy stepped stone pyramid pedestal topped with a flared metal warship landing platform, mooring posts and a side lattice gantry crane, matte, stylized game asset.",
};
