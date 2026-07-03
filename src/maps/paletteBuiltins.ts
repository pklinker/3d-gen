// Built-in terrain-kind palette. Two layers:
//
//   1. GOLDEN_KIND_DOCS — the three core kinds flyers actually ships
//      (data/terrain.json), pinned to match its exact hand-tuned rules/render
//      values (verified against the golden fixture in
//      __fixtures__/golden.ts — see the T7 parity tests).
//   2. AUTO_REGISTRY_KIND_DOCS — every OTHER terrain/buildings/effects
//      artifact in the registry, derived via autoKind.ts so the painter has
//      the full catalog to paint with immediately rather than only the three
//      the game happens to ship today. Rule defaults here are coarse
//      (mesh -> blocks LOS, effect -> doesn't) since there's no way to guess
//      "does a rift block a shot?" from geometry alone; a modder tunes these
//      per kind before shipping (the same rule fields KindForm always left
//      editable).
//
// The Maps painter has something to paint with even when the game dir is
// unreachable (fully optional/offline-capable, matching this editor's
// existing "works with no game connection" philosophy). When the game IS
// reachable, useCatalogData layers the live data/terrain.json over ALL of
// this by id (upsertById) — a live kind (identical or retuned data) replaces
// its built-in twin; any further mod-added kind appends.

import { artifactsInCategory } from "../artifacts/registry";
import { deriveKindDocFromArtifact } from "./autoKind";
import { upsertById } from "./merge";
import type { ArtifactType } from "../types";
import type { TerrainKindDoc } from "./types";

export const GOLDEN_KIND_DOCS: TerrainKindDoc[] = [
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

/** Which registry generator previews a golden kind's mesh in the painter — the
 *  golden docs above don't set generatorType (they predate that field, and
 *  their id/ArtifactType spelling differs for dust_storm/duststorm), so
 *  kindMesh.ts falls back to this table when generatorType is unset. */
export const BUILTIN_KIND_ARTIFACT: Record<string, ArtifactType> = {
  hill: "hill",
  tower: "tower",
  dust_storm: "duststorm",
};

// Every terrain/buildings/effects artifact NOT already covered by a golden
// kind above (ships/ordnance are excluded — those aren't map terrain, they're
// player-placed vessels and fired weapons; see PLACEMENT.md).
const GOLDEN_ARTIFACT_TYPES = new Set<ArtifactType>(["hill", "tower", "duststorm"]);
const AUTO_REGISTRY_KIND_DOCS: TerrainKindDoc[] = [
  ...artifactsInCategory("terrain"),
  ...artifactsInCategory("buildings"),
  ...artifactsInCategory("effects"),
]
  .filter((a) => !GOLDEN_ARTIFACT_TYPES.has(a.type))
  .map((a) => deriveKindDocFromArtifact(a.type));

/** The full out-of-the-box palette: golden kinds win their slot (last-writer-
 *  wins by id, same rule the game's own catalog merge uses), the rest of the
 *  registry appended after. */
export const BUILTIN_KIND_DOCS: TerrainKindDoc[] = AUTO_REGISTRY_KIND_DOCS.reduce(
  (acc, doc) => upsertById(acc, doc),
  GOLDEN_KIND_DOCS,
);
