// Client for the dev-server map/terrain-kind merge endpoints
// (vite-plugin-savefiles.ts /api/save-map, /api/save-terrain-kind). Unlike
// saveToGame's /api/save (overwrite a file), these upsert one entry into a
// shared JSON array by id — see src/maps/merge.ts.

import type { MapEntry, TerrainKindEntry } from "../maps/types";

async function postEntry(url: string, entry: MapEntry | TerrainKindEntry): Promise<{ file: string; count: number }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "save failed");
  return { file: j.file, count: j.count };
}

/** Upsert a map into the game's data/maps.json by id. */
export function saveMapToGame(entry: MapEntry): Promise<{ file: string; count: number }> {
  return postEntry("/api/save-map", entry);
}

/** Upsert a terrain kind into the game's data/terrain.json by id. */
export function saveTerrainKindToGame(entry: TerrainKindEntry): Promise<{ file: string; count: number }> {
  return postEntry("/api/save-terrain-kind", entry);
}
