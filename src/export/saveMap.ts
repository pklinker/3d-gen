// Client for the dev-server map/terrain-kind endpoints
// (vite-plugin-savefiles.ts /api/save-map, /api/save-terrain-kind,
// /api/terrain-kinds, /api/maps). The save-* calls upsert one entry into a
// shared JSON array by id (src/maps/merge.ts), unlike saveToGame's /api/save
// which overwrites a file; the fetch-* calls read the game's current catalog
// so the painter's palette/map picker reflect what's actually there.

import type { MapEntry, MapsFile, TerrainFile, TerrainKindEntry } from "../maps/types";

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

/** The game's current terrain.json ({ terrain: [] } if unreachable/missing —
 *  never throws, since "no game connection yet" is a normal editor state). */
export async function fetchTerrainKinds(): Promise<TerrainKindEntry[]> {
  try {
    const r = await fetch("/api/terrain-kinds");
    if (!r.ok) return [];
    return ((await r.json()) as TerrainFile).terrain;
  } catch {
    return [];
  }
}

/** The game's current maps.json ({ maps: [] } if unreachable/missing). */
export async function fetchMaps(): Promise<MapEntry[]> {
  try {
    const r = await fetch("/api/maps");
    if (!r.ok) return [];
    return ((await r.json()) as MapsFile).maps;
  } catch {
    return [];
  }
}
