// Single source of truth for the AI-generation contract (see the game's art plan §4b).
// 1 unit = one hex circumradius. Y-up, +Z = north, base sits on Y = 0.

export type ArtifactType = "hill" | "tower" | "duststorm";
export type OutputKind = "mesh" | "effect";

export interface MeshContract {
  /** Target footprint in hex-circumradius units (X and Z). */
  footprint: number;
  /** Target height in hex-circumradius units (Y). */
  height: number;
  /** Tolerance (fraction) applied to footprint/height checks. */
  sizeTolerance: number;
  /** Albedo / vertex base color, hex string. */
  color: string;
  /** Max triangle count before decimation kicks in / validation fails. */
  triBudget: number;
  /** Matte PBR target. */
  metalness: number;
  roughness: number;
}

// Heights match the game's TerrainDef.render_height (hill 0.55, tower 1.5).
export const MESH_CONTRACTS: Record<"hill" | "tower", MeshContract> = {
  hill: {
    footprint: 1.8,
    height: 0.55,
    sizeTolerance: 0.25,
    color: "#80592A", // sun-bleached ochre-brown
    triBudget: 3000,
    metalness: 0,
    roughness: 0.9,
  },
  tower: {
    footprint: 0.8,
    height: 1.5,
    sizeTolerance: 0.25,
    color: "#9A948A", // weathered off-white limestone/marble
    triBudget: 3000,
    metalness: 0,
    roughness: 0.9,
  },
};

// Anchor / base flush tolerance, in units. The base min-Y must be within this of 0.
export const BASE_EPSILON = 0.01;
// X/Z centering tolerance, in units.
export const CENTER_EPSILON = 0.05;

// Map palette context (ochre) — used for the viewport background to judge contrast.
export const MAP_BG = "#C8A86A";

// Field-rotation cache granularity from the art plan (~15 deg).
export const ROTATION_STEP_DEG = 15;

// Small-zoom read check size in px (the game blits at <= 256 px).
export const READ_CHECK_PX = 256;
