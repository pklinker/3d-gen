// Golden fixture (MAP_MODDING.md §0.10): the flyers repo's SHIPPED
//   /Users/paulklinker/src/flyers/data/terrain.json
//   /Users/paulklinker/src/flyers/data/maps.json
// mirrored here as both editor-side *Doc objects and their expected wire
// *Entry JSON. serialize.test.ts asserts mapDocToEntry/kindDocToEntry
// reproduce the expected entries exactly.
//
// This is the cross-repo schema-sync mechanism the plan calls for: if flyers'
// data/*.json (or MapDef/TerrainKindDef's from_dict) changes shape, update the
// GOLDEN_*_ENTRY objects below to match and this suite goes red until
// serialize.ts (and types.ts) catch up — drift becomes a failing test, not a
// silent mismatch. Last synced against flyers commit cabc2fd (T6).

import type { MapDoc, MapEntry, TerrainKindDoc, TerrainKindEntry } from "../types";

export const GOLDEN_HILL_DOC: TerrainKindDoc = {
  id: "hill",
  displayName: "Hill",
  category: "terrain",
  blocksLos: true,
  spotPenalty: 0,
  color: [0.5, 0.35, 0.15, 0.8],
  height: 0.55,
  model: { dir: "terrain", prefix: "hill", frame: 2.2, span: 2.0, lookY: 0.3, anchor: 0.58 },
};

export const GOLDEN_TOWER_DOC: TerrainKindDoc = {
  id: "tower",
  displayName: "Tower",
  category: "building",
  blocksLos: true,
  spotPenalty: 0,
  color: [0.42, 0.42, 0.42, 0.88],
  height: 1.5,
  footprint: 0.42,
  model: { dir: "buildings", prefix: "tower", frame: 2.0, span: 1.1, lookY: 0.7, anchor: 0.72 },
};

export const GOLDEN_DUST_STORM_DOC: TerrainKindDoc = {
  id: "dust_storm",
  displayName: "Dust",
  category: "terrain",
  blocksLos: false,
  spotPenalty: 1,
  color: [0.85, 0.72, 0.28, 0.42],
  height: 0.0,
  sprite: { prefix: "duststorm", span: 1.8, anchor: 0.62 },
};

export const GOLDEN_HILL_ENTRY: TerrainKindEntry = {
  id: "hill",
  display_name: "Hill",
  category: "terrain",
  blocks_los: true,
  spot_penalty: 0,
  render: {
    color: [0.5, 0.35, 0.15, 0.8],
    height: 0.55,
    model: { dir: "terrain", prefix: "hill", frame: 2.2, span: 2.0, look_y: 0.3, anchor: 0.58 },
  },
};

export const GOLDEN_TOWER_ENTRY: TerrainKindEntry = {
  id: "tower",
  display_name: "Tower",
  category: "building",
  blocks_los: true,
  spot_penalty: 0,
  render: {
    color: [0.42, 0.42, 0.42, 0.88],
    height: 1.5,
    footprint: 0.42,
    model: { dir: "buildings", prefix: "tower", frame: 2.0, span: 1.1, look_y: 0.7, anchor: 0.72 },
  },
};

export const GOLDEN_DUST_STORM_ENTRY: TerrainKindEntry = {
  id: "dust_storm",
  display_name: "Dust",
  category: "terrain",
  blocks_los: false,
  spot_penalty: 1,
  render: {
    color: [0.85, 0.72, 0.28, 0.42],
    height: 0.0,
    sprite: { prefix: "duststorm", span: 1.8, anchor: 0.62 },
  },
};

export const GOLDEN_DEAD_SEA_BOTTOM_DOC: MapDoc = {
  id: "dead_sea_bottom",
  displayName: "Dead Sea Bottom",
  cols: 48,
  rows: 48,
  deployZoneCols: 24,
  deployMinSeparation: 10,
  cells: [
    { q: 25, r: 7, kind: "hill" },
    { q: 26, r: 7, kind: "hill" },
    { q: 27, r: 5, kind: "tower" },
    { q: 28, r: 8, kind: "dust_storm" },
    { q: 29, r: 8, kind: "dust_storm" },
    { q: 29, r: 7, kind: "dust_storm" },
  ],
};

export const GOLDEN_STORM_FRONT_DOC: MapDoc = {
  id: "storm_front",
  displayName: "Storm Front",
  cols: 48,
  rows: 48,
  deployZoneCols: 24,
  deployMinSeparation: 10,
  cells: [
    { q: 23, r: 5, kind: "dust_storm" },
    { q: 24, r: 6, kind: "dust_storm" },
    { q: 24, r: 7, kind: "dust_storm" },
    { q: 25, r: 8, kind: "dust_storm" },
    { q: 22, r: 9, kind: "hill" },
    { q: 23, r: 9, kind: "hill" },
    { q: 26, r: 4, kind: "tower" },
  ],
};

export const GOLDEN_DEAD_SEA_BOTTOM_ENTRY: MapEntry = {
  id: "dead_sea_bottom",
  display_name: "Dead Sea Bottom",
  cols: 48,
  rows: 48,
  deploy_zone_cols: 24,
  deploy_min_separation: 10,
  terrain: [
    { hex: [25, 7], type: "hill" },
    { hex: [26, 7], type: "hill" },
    { hex: [27, 5], type: "tower" },
    { hex: [28, 8], type: "dust_storm" },
    { hex: [29, 8], type: "dust_storm" },
    { hex: [29, 7], type: "dust_storm" },
  ],
};

export const GOLDEN_STORM_FRONT_ENTRY: MapEntry = {
  id: "storm_front",
  display_name: "Storm Front",
  cols: 48,
  rows: 48,
  deploy_zone_cols: 24,
  deploy_min_separation: 10,
  terrain: [
    { hex: [23, 5], type: "dust_storm" },
    { hex: [24, 6], type: "dust_storm" },
    { hex: [24, 7], type: "dust_storm" },
    { hex: [25, 8], type: "dust_storm" },
    { hex: [22, 9], type: "hill" },
    { hex: [23, 9], type: "hill" },
    { hex: [26, 4], type: "tower" },
  ],
};
