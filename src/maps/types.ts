// Data model for the map/terrain-kind catalog the flyers game reads
// (res://data/maps.json + res://data/terrain.json — see MAP_MODDING.md §4/§5
// in the flyers repo). Two shapes per concept, mirroring the flyers-side split
// between ShipDef-style Resources and their to_dict()/from_dict() wire format:
//
//   *Doc    — editor-internal representation (camelCase, TS-idiomatic). This is
//             what a future Maps painter (T8) would hold as state.
//   *Entry  — the exact JSON shape flyers' MapDef.from_dict() / TerrainKindDef
//             .from_dict() parse (snake_case, matching data/maps.json /
//             data/terrain.json verbatim). Only *Entry ever crosses the wire.
//
// Keeping the boundary explicit (rather than authoring camelCase strings that
// happen to serialize) is what makes serialize.ts a single, testable seam — if
// the flyers schema changes, exactly one function needs to change here too.

/** One painted hex on a map, before serialization. */
export interface MapCell {
  q: number; // hex.x (column)
  r: number; // hex.y (row)
  kind: string; // terrain-kind id (TerrainKindDoc.id / TerrainKindEntry.id)
}

/** Editor-internal map document (T8's painter state shape). */
export interface MapDoc {
  id: string;
  displayName: string;
  cols: number;
  rows: number;
  deployZoneCols: number;
  deployMinSeparation: number;
  cells: MapCell[];
}

/** Wire format for one entry in data/maps.json's "maps" array. */
export interface MapEntry {
  id: string;
  display_name: string;
  cols: number;
  rows: number;
  deploy_zone_cols: number;
  deploy_min_separation: number;
  terrain: { hex: [number, number]; type: string }[];
}

/** render.model — an extruded/baked mesh (frame/span/look_y/anchor tuning). */
export interface RenderModelDoc {
  dir: string;
  prefix: string;
  frame: number;
  span: number;
  lookY: number;
  anchor: number;
}
export interface RenderModelEntry {
  dir: string;
  prefix: string;
  frame: number;
  span: number;
  look_y: number;
  anchor: number;
}

/** render.sprite — an animated billboard sheet. `dir` defaults to "terrain"
 *  game-side when omitted (ui/dust_sprites.gd), so it's optional here too. */
export interface RenderSpriteDoc {
  prefix: string;
  span: number;
  anchor: number;
  dir?: string;
}
export type RenderSpriteEntry = RenderSpriteDoc;

/** Editor-internal terrain-kind document. Exactly one of model/sprite is set
 *  (a kind renders as a mesh, a sprite, or — with neither — the procedural
 *  fallback the game already draws when no asset is registered). */
export interface TerrainKindDoc {
  id: string;
  displayName: string;
  /** Editor/asset grouping only ("terrain" | "building") — rules never read
   *  it; matches TerrainKindDef.category in the game. */
  category: "terrain" | "building";
  blocksLos: boolean;
  spotPenalty: number;
  color: [number, number, number, number];
  height: number;
  /** Prism-fallback footprint radius in hex units (1.0 fills the hex). */
  footprint?: number;
  model?: RenderModelDoc;
  sprite?: RenderSpriteDoc;
}

/** Wire format for one entry in data/terrain.json's "terrain" array. */
export interface TerrainKindEntry {
  id: string;
  display_name: string;
  category: string;
  blocks_los: boolean;
  spot_penalty: number;
  render: {
    color: [number, number, number, number];
    height: number;
    footprint?: number;
    model?: RenderModelEntry;
    sprite?: RenderSpriteEntry;
  };
}

/** The on-disk shape of data/maps.json / data/terrain.json. */
export interface MapsFile {
  maps: MapEntry[];
}
export interface TerrainFile {
  terrain: TerrainKindEntry[];
}
