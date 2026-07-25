import { useCallback, useEffect, useState } from "react";
import { fetchMaps, fetchTerrainKinds } from "../export/saveMap";
import { listVariants } from "../variants/store";
import { variantToKindDoc } from "../variants/toKind";
import { upsertById } from "./merge";
import { entryToKindDoc, entryToMapDoc } from "./serialize";
import { BUILTIN_KIND_DOCS } from "./paletteBuiltins";
import type { MapDoc, TerrainKindDoc } from "./types";

interface CatalogData {
  /** Palette, layered in three passes (each upsertById, so a later pass
   *  replaces an earlier entry with the same id and otherwise appends):
   *
   *    1. BUILTIN_KIND_DOCS — the whole registry at default tuning (§6.1).
   *    2. the game's live data/terrain.json — what's actually shipped.
   *    3. saved variants (data/variants.json) — the modder's own tunings.
   *
   *  Variants land last because they're the authoring source: if a variant and
   *  a shipped kind share an id, the variant is the one currently being
   *  authored and the only one carrying generator params, so it must win or
   *  the painter would preview the stock mesh for a tuned kind.
   *
   *  Works fully offline (nothing reachable -> just the built-ins), matching
   *  the editor's existing offline-capable philosophy (§6.1). */
  kinds: TerrainKindDoc[];
  /** Existing maps in the game, for the "load to keep editing" picker. Empty
   *  when unreachable — that's a normal state (nothing to reopen yet), not an
   *  error. */
  maps: MapDoc[];
  loading: boolean;
  /** Re-pull from the game (e.g. after an export, to pick up the just-written
   *  entry in the live list). */
  refresh: () => void;
}

export function useCatalogData(): CatalogData {
  const [kinds, setKinds] = useState<TerrainKindDoc[]>(BUILTIN_KIND_DOCS);
  const [maps, setMaps] = useState<MapDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchTerrainKinds(), fetchMaps(), listVariants()]).then(
      ([kindEntries, mapEntries, variantList]) => {
        if (cancelled) return;
        const layered = [
          ...kindEntries.map(entryToKindDoc),
          ...variantList.variants.map(variantToKindDoc),
        ];
        setKinds(layered.reduce((acc, k) => upsertById(acc, k), BUILTIN_KIND_DOCS));
        setMaps(mapEntries.map(entryToMapDoc));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { kinds, maps, loading, refresh };
}
