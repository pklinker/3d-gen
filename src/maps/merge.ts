// Shared upsert-by-id logic for the /api/save-map and /api/save-terrain-kind
// endpoints (vite-plugin-savefiles.ts). Both merge one entry into a JSON array
// keyed by "id": add a new id, replace an existing one IN PLACE (same array
// index — the catalog picker/order never reshuffles on a re-export), leave
// every other entry untouched. One generic implementation for both maps.json's
// "maps" array and terrain.json's "terrain" array, since the rule is identical
// — this is the exact logic Issue 6 flagged as untested and catalog-corrupting
// if it drifts (MAP_MODDING.md §0.11).
//
// Pure and Node-free (no fs) so it is unit-testable in isolation and reusable
// from the dev-server plugin without dragging file I/O into the tests.

export function upsertById<T extends { id: string }>(list: T[], entry: T): T[] {
  const idx = list.findIndex((x) => x.id === entry.id);
  if (idx === -1) return [...list, entry];
  const next = [...list];
  next[idx] = entry;
  return next;
}
