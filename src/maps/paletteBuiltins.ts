// Built-in terrain-kind palette: the three core kinds flyers ships
// (data/terrain.json), so the Maps painter has something to paint with even
// when the game dir is unreachable (fully optional/offline-capable, matching
// the rest of this editor's "works with no game connection" philosophy).
// When the game IS reachable, useCatalogData layers the live data/terrain.json
// over these by id (upsertById) — a live core kind (identical data) simply
// replaces its built-in twin; any mod-added kind appends.

import type { ArtifactType } from "../types";
import type { TerrainKindDoc } from "./types";

export const BUILTIN_KIND_DOCS: TerrainKindDoc[] = [
  {
    id: "hill",
    displayName: "Hill",
    category: "terrain",
    blocksLos: true,
    spotPenalty: 0,
    color: [0.5, 0.35, 0.15, 0.8],
    height: 0.55,
    model: { dir: "terrain", prefix: "hill", frame: 2.2, span: 2.0, lookY: 0.3, anchor: 0.58 },
  },
  {
    id: "tower",
    displayName: "Tower",
    category: "building",
    blocksLos: true,
    spotPenalty: 0,
    color: [0.42, 0.42, 0.42, 0.88],
    height: 1.5,
    footprint: 0.42,
    model: { dir: "buildings", prefix: "tower", frame: 2.0, span: 1.1, lookY: 0.7, anchor: 0.72 },
  },
  {
    id: "dust_storm",
    displayName: "Dust",
    category: "terrain",
    blocksLos: false,
    spotPenalty: 1,
    color: [0.85, 0.72, 0.28, 0.42],
    height: 0.0,
    sprite: { prefix: "duststorm", span: 1.8, anchor: 0.62 },
  },
];

/** Which registry generator previews a built-in kind's mesh in the painter.
 *  A kind created via KindForm carries its own binding directly (the user
 *  picks a generator explicitly) — this table only covers the shipped three,
 *  whose kind-id and ArtifactType happen to spell differently
 *  ("dust_storm" vs "duststorm"). */
export const BUILTIN_KIND_ARTIFACT: Record<string, ArtifactType> = {
  hill: "hill",
  tower: "tower",
  dust_storm: "duststorm",
};
