// An artifact VARIANT: one saved, named tuning of a registry generator —
// "Dry Moss Dunes" and "Overgrown Moss Dunes" are two variants of the single
// `mossdunes` artifact, differing only in seed + params.
//
// Why this exists as its own concept: the registry gives one generator per
// artifact type, and the Maps painter could previously only paint a generator
// at its DEFAULT params/seed (kindMesh.ts hard-coded seed 1 + defaultParams).
// So the tuning a modder does in the Artifacts tab — the actual authoring work
// — had nowhere to live and nothing downstream could use it. A variant is that
// tuning, given an id, so it can (a) persist in a file, (b) become a paintable
// terrain kind, and (c) export as its own .glb.
//
// Variants are EDITOR-side authoring source data, so they live in this repo
// (data/variants.json), not in the game's data/. The game never sees generator
// params — it consumes the baked .glb plus the terrain.json entry.

import type { ArtifactType, ParamValues } from "../types";

export interface ArtifactVariant {
  /** Slug. Doubles as the terrain-kind id and the exported asset's file stem,
   *  so one name identifies the variant across editor, assets and game data. */
  id: string;
  displayName: string;
  type: ArtifactType;
  seed: number;
  /** Generator params at save time. For buildings this also carries the global
   *  `ornament` level, which App.tsx keeps outside the per-type params but
   *  feeds into generate() — without it a saved building wouldn't reproduce. */
  params: ParamValues;
  savedAt: number;
}

/** The on-disk shape of data/variants.json. */
export interface VariantsFile {
  variants: ArtifactVariant[];
}
