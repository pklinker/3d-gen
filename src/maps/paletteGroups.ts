// Groups the Maps painter's flat palette into sections by terrain type, so
// the right-hand panel reads as "Terrain / Buildings / Effects" instead of
// one long undifferentiated list.
//
// TerrainKindDoc.category only distinguishes "terrain" | "building" (it's the
// coarse editor/asset field KindForm exposes) — it can't tell a rift from a
// dust storm. The registry's own ArtifactCategory (terrain/buildings/effects,
// registry.ts CATEGORIES) is the real taxonomy, so a kind backed by a
// generator is grouped by ITS artifact's category; only a hand-authored
// decoration with no generator falls back to the coarser doc.category.

import { CATEGORIES, getArtifact } from "../artifacts/registry";
import { BUILTIN_KIND_ARTIFACT } from "./paletteBuiltins";
import type { ArtifactCategory } from "../types";
import type { TerrainKindDoc } from "./types";

// Map kinds are only ever terrain/buildings/effects (ships/ordnance are
// player-placed, not paintable — see paletteBuiltins.ts), so ships/ordnance
// sections never appear even though CATEGORIES lists them for the Artifacts tab.
const PALETTE_CATEGORIES = new Set<ArtifactCategory>(["terrain", "buildings", "effects"]);

function categoryOf(kind: TerrainKindDoc): ArtifactCategory {
  const artifactType = kind.generatorType ?? BUILTIN_KIND_ARTIFACT[kind.id];
  if (artifactType) return getArtifact(artifactType).category;
  return kind.category === "building" ? "buildings" : "terrain";
}

export interface PaletteSection {
  category: ArtifactCategory;
  label: string;
  kinds: TerrainKindDoc[];
}

/** Group `kinds` into ordered, labeled sections — empty sections omitted,
 *  each section's kinds sorted alphabetically by display name. */
export function groupPalette(kinds: TerrainKindDoc[]): PaletteSection[] {
  const byCategory = new Map<ArtifactCategory, TerrainKindDoc[]>();
  for (const kind of kinds) {
    const cat = categoryOf(kind);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(kind);
  }
  return CATEGORIES.filter((c) => PALETTE_CATEGORIES.has(c.id) && byCategory.has(c.id)).map((c) => ({
    category: c.id,
    label: c.label,
    kinds: [...byCategory.get(c.id)!].sort((a, b) => a.displayName.localeCompare(b.displayName)),
  }));
}
