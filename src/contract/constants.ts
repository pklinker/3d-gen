// Single source of truth for the AI-generation contract (see the game's art plan §4b).
// 1 unit = one hex circumradius. Y-up, +Z = north, base sits on Y = 0.

export type ArtifactType =
  | "hill"
  | "tower"
  | "duststorm"
  | "mountain"
  | "rift"
  | "mossdunes"
  | "spires"
  | "atmosphere"
  | "ramparts"
  | "mooringSpire"
  | "landingStage"
  | "pumpStation"
  | "observatory"
  | "incubator"
  | "skyVilla"
  | "fighter"
  | "attack"
  | "scout"
  | "lightCruiser"
  | "cruiser"
  | "heathaze"
  | "radiumstorm";
export type OutputKind = "mesh" | "effect";

/** Which mesh contract a mesh artifact is held to. Several artifact types can share one
 *  (e.g. all three mountains use "mountain"). */
export type ContractKey =
  | "hill"
  | "tower"
  | "mountain"
  | "rift"
  | "mossdunes"
  | "spires"
  | "atmosphere"
  | "ramparts"
  | "mooringSpire"
  | "landingStage"
  | "pumpStation"
  | "observatory"
  | "incubator"
  | "skyVilla"
  | "fighter"
  | "attack"
  | "scout"
  | "lightCruiser"
  | "cruiser";

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

// Heights match the game's TerrainDef.render_height (hill 0.55, tower 1.5). Mountains are
// a taller terrain feature than the low hill/mesa; `color` is only a fallback used when a
// generated mesh carries no vertex colors (e.g. AI output) — procedural generators paint
// their own palette and that is preserved.
export const MESH_CONTRACTS: Record<ContractKey, MeshContract> = {
  hill: {
    footprint: 1.8,
    height: 0.55,
    sizeTolerance: 0.25,
    color: "#80592A", // sun-bleached ochre-brown
    triBudget: 3000,
    metalness: 0,
    roughness: 0.9,
  },
  mountain: {
    footprint: 1.8,
    height: 1.1,
    sizeTolerance: 0.3,
    color: "#6E6256", // neutral rock (fallback only)
    triBudget: 3000,
    metalness: 0,
    roughness: 0.95,
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
  // A trench/canyon carved into a ground slab: base (trench floor) on Y=0, the surrounding
  // plateau rim is the bbox top, so `height` is the canyon depth.
  rift: {
    footprint: 1.8,
    height: 0.45,
    sizeTolerance: 0.4,
    color: "#7A5A2E", // dry ochre seabed rock
    triBudget: 4000,
    metalness: 0,
    roughness: 0.95,
  },
  // Low rolling moss-carpeted dunes across the dead-sea bottom.
  mossdunes: {
    footprint: 1.8,
    height: 0.4,
    sizeTolerance: 0.4,
    color: "#A9852F", // yellowish-ochre Barsoomian moss
    triBudget: 4000,
    metalness: 0,
    roughness: 1,
  },
  // Cluster of sharp mineral spires jutting up — a tall collision hazard.
  spires: {
    footprint: 1.6,
    height: 1.7,
    sizeTolerance: 0.35,
    color: "#9A7FB0", // pale amethyst crystal (fallback)
    triBudget: 4000,
    metalness: 0.1,
    roughness: 0.6,
  },
  // Atmosphere plant: a domed tech core on a drum, ringed by industrial conduits with
  // vent nozzles — a tall piece of Martian infrastructure.
  atmosphere: {
    footprint: 1.6,
    height: 1.4,
    sizeTolerance: 0.3,
    color: "#6E7B73", // oxidized patina metal
    triBudget: 5000,
    metalness: 0.25,
    roughness: 0.65,
  },
  // Walled-city ramparts: a crenellated defensive perimeter with a central gate and
  // angled buttresses — base on Y=0, height is the wall crown.
  ramparts: {
    footprint: 1.8,
    height: 0.8,
    sizeTolerance: 0.3,
    color: "#9A8C70", // sun-bleached sandstone
    triBudget: 5000,
    metalness: 0,
    roughness: 0.95,
  },
  // Radium Mooring Spire: a slender art-deco tower with vertical fins and a glowing
  // emitter segment, crowned by a grapple ring that secures a flyer's nose. Tall hazard.
  mooringSpire: {
    footprint: 0.8,
    height: 2.0,
    sizeTolerance: 0.3,
    color: "#B7C0C8", // pale anodized steel
    triBudget: 6000,
    metalness: 0.45,
    roughness: 0.45,
  },
  // Fleet Landing Stage: a multi-tiered stone stepped pyramid topped by a flared metal
  // landing platform with a side gantry — base on Y=0, a low broad warship berth.
  landingStage: {
    footprint: 1.8,
    height: 1.0,
    sizeTolerance: 0.3,
    color: "#9A8C70", // sun-bleached sandstone base
    triBudget: 7000,
    metalness: 0.15,
    roughness: 0.8,
  },
  // Water Inflow Pumping Station: an ornate domed canal house spanning a vaulted arch,
  // wrapped in heavy external conduits — broad and squat over the grand canals.
  pumpStation: {
    footprint: 1.7,
    height: 1.0,
    sizeTolerance: 0.3,
    color: "#8A8472", // weathered canal stone
    triBudget: 7000,
    metalness: 0.2,
    roughness: 0.7,
  },
  // Astronomical Observatory / Astrological Minaret: a hyper-tall slender minaret topped
  // with a brass telescope barrel and counterweights — a precarious vertical hazard.
  observatory: {
    footprint: 0.75,
    height: 2.3,
    sizeTolerance: 0.35,
    color: "#A89B86", // pale stone shaft (brass instrument painted in generator)
    triBudget: 6000,
    metalness: 0.25,
    roughness: 0.55,
  },
  // Fluted Incubator Vault: a heavily reinforced sloping dome with structural ribs and
  // ventilation fins — squat, armoured, deflecting artillery.
  incubator: {
    footprint: 1.6,
    height: 0.95,
    sizeTolerance: 0.3,
    color: "#9A8C70", // reinforced sandstone
    triBudget: 7000,
    metalness: 0.05,
    roughness: 0.85,
  },
  // Aristocrat's Sky-Villa / Spire-Palace: a top-heavy residential tower of stacked
  // cantilevered balcony tiers on a narrow base, with sweeping awnings. Tall hazard.
  skyVilla: {
    footprint: 1.0,
    height: 1.9,
    sizeTolerance: 0.35,
    color: "#C4B69C", // sunlit ivory plaster
    triBudget: 7000,
    metalness: 0.1,
    roughness: 0.7,
  },
  // One-man Flier (Fighter): a slender wooden airboat hull with a scrolled prow, a small
  // brass cockpit cabin, a stern mast + pennant, and a radial pusher propeller flanked by
  // tail vanes. Long along Z (the keel axis); height is the masthead. A flying craft, so
  // the "base on Y=0" anchor just rests the keel on the ground plane in the editor.
  fighter: {
    footprint: 1.6,
    height: 0.75,
    sizeTolerance: 0.45,
    color: "#6E4A2A", // oiled hull timber
    triBudget: 6000,
    metalness: 0.2,
    roughness: 0.6,
  },
  // Twin-engine Attack ship: a streamlined wooden fuselage with a glass canopy, a forward
  // nose cannon, and two wing-mounted tractor engines, twin-finned at the tail. Long along Z;
  // height is the canopy/tail. A flying craft, so the Y=0 anchor just rests it on the plane.
  attack: {
    footprint: 1.6,
    height: 0.45,
    sizeTolerance: 0.45,
    color: "#6E4A2A", // oiled hull timber
    triBudget: 6000,
    metalness: 0.2,
    roughness: 0.6,
  },
  // Cruiser: light cruiser hull + forward turret + a second twin-barrelled turret at the
  // stern, covering the rear arc. Otherwise identical proportions to the light cruiser.
  cruiser: {
    footprint: 1.8,
    height: 0.85,
    sizeTolerance: 0.45,
    color: "#4A3010", // darker oiled timber to distinguish from Light Cruiser
    triBudget: 8000,
    metalness: 0.2,
    roughness: 0.65,
  },
  // Light Cruiser: a wide timber airboat hull with a two-tier superstructure cabin, a
  // forward gun turret with twin barrels, and two rear pusher engines on stern outriggers.
  lightCruiser: {
    footprint: 1.8,
    height: 0.85,
    sizeTolerance: 0.45,
    color: "#5A3A1A", // dark oiled hull timber
    triBudget: 7000,
    metalness: 0.2,
    roughness: 0.65,
  },
  // Scout: a fighter-style timber airboat hull with a scrolled prow and cockpit cabin, but
  // driven by two rear pusher engines on stern outriggers. Long along Z; height is the mast.
  // A flying craft, so the "base on Y=0" anchor just rests the keel on the ground plane.
  scout: {
    footprint: 1.6,
    height: 0.6,
    sizeTolerance: 0.45,
    color: "#6E4A2A", // oiled hull timber
    triBudget: 6000,
    metalness: 0.2,
    roughness: 0.6,
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

// Pointy-top hex flat-to-flat width in circumradius units (= 2·apothem = √3). The optional
// "fit to hex" conform mode pulls a mesh's footprint within this so it doesn't overhang the
// hex's flat edges (the corners are the responsibility of the future hex-clip pass).
export const HEX_FLAT_TO_FLAT = Math.sqrt(3);

// Small-zoom read check size in px (the game blits at <= 256 px).
export const READ_CHECK_PX = 256;
