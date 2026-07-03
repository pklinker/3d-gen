import { useCallback, useEffect, useState } from "react";
import { fetchMaps, fetchTerrainKinds } from "../export/saveMap";
import { upsertById } from "./merge";
import { entryToKindDoc, entryToMapDoc } from "./serialize";
import { BUILTIN_KIND_DOCS } from "./paletteBuiltins";
import type { MapDoc, TerrainKindDoc } from "./types";

interface CatalogData {
  /** Palette: BUILTIN_KIND_DOCS layered under whatever the game currently has
   *  (upsertById — a live core kind replaces its built-in twin with identical
   *  data; a mod-added kind appends). Works fully offline (game unreachable ->
   *  just the three built-ins), matching the editor's existing offline-capable
   *  philosophy (§6.1). */
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
    void Promise.all([fetchTerrainKinds(), fetchMaps()]).then(([kindEntries, mapEntries]) => {
      if (cancelled) return;
      const liveKinds = kindEntries.map(entryToKindDoc);
      setKinds(liveKinds.reduce((acc, k) => upsertById(acc, k), BUILTIN_KIND_DOCS));
      setMaps(mapEntries.map(entryToMapDoc));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { kinds, maps, loading, refresh };
}
