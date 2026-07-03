import type {
  MapDoc,
  MapEntry,
  RenderModelDoc,
  RenderModelEntry,
  RenderSpriteDoc,
  TerrainKindDoc,
  TerrainKindEntry,
} from "./types";

/** MapDoc (editor state) -> MapEntry (the exact shape flyers' MapDef.from_dict
 *  parses). Pure, deterministic — see __tests__/serialize.test.ts for the
 *  golden-fixture proof that this matches the shipped flyers data/maps.json. */
export function mapDocToEntry(doc: MapDoc): MapEntry {
  return {
    id: doc.id,
    display_name: doc.displayName,
    cols: doc.cols,
    rows: doc.rows,
    deploy_zone_cols: doc.deployZoneCols,
    deploy_min_separation: doc.deployMinSeparation,
    terrain: doc.cells.map((c) => ({ hex: [c.q, c.r], type: c.kind })),
  };
}

function modelToEntry(m: RenderModelDoc): RenderModelEntry {
  return { dir: m.dir, prefix: m.prefix, frame: m.frame, span: m.span, look_y: m.lookY, anchor: m.anchor };
}

function spriteToEntry(s: RenderSpriteDoc) {
  return s.dir === undefined
    ? { prefix: s.prefix, span: s.span, anchor: s.anchor }
    : { prefix: s.prefix, span: s.span, anchor: s.anchor, dir: s.dir };
}

/** TerrainKindDoc -> TerrainKindEntry (the exact shape flyers'
 *  TerrainKindDef.from_dict parses). render.model / render.sprite are included
 *  only when the doc set them — an absent field means "no model"/"no sprite"
 *  to TerrainKindDef.has_model()/has_sprite(), not an empty object. */
export function kindDocToEntry(doc: TerrainKindDoc): TerrainKindEntry {
  const render: TerrainKindEntry["render"] = {
    color: doc.color,
    height: doc.height,
  };
  if (doc.footprint !== undefined) render.footprint = doc.footprint;
  if (doc.model) render.model = modelToEntry(doc.model);
  if (doc.sprite) render.sprite = spriteToEntry(doc.sprite);
  return {
    id: doc.id,
    display_name: doc.displayName,
    category: doc.category,
    blocks_los: doc.blocksLos,
    spot_penalty: doc.spotPenalty,
    render,
  };
}

// --- Inverse direction: loading the game's live catalog into the editor -----
// (useCatalogData.ts fetches GET /api/terrain-kinds / /api/maps and hydrates
// these into palette/map state so an existing map can be reopened and re-
// exported, not just authored blind.)

function modelToDoc(m: RenderModelEntry): RenderModelDoc {
  return { dir: m.dir, prefix: m.prefix, frame: m.frame, span: m.span, lookY: m.look_y, anchor: m.anchor };
}

/** TerrainKindEntry -> TerrainKindDoc. `category` widens to the Doc's open
 *  union defensively — an entry from an old/foreign pack could carry anything
 *  in that string field; unrecognised values fall back to "terrain" rather
 *  than producing an invalid Doc. generatorType is left unset (the wire
 *  format doesn't carry it — see TerrainKindDoc.generatorType). */
export function entryToKindDoc(entry: TerrainKindEntry): TerrainKindDoc {
  const category = entry.category === "building" ? "building" : "terrain";
  const doc: TerrainKindDoc = {
    id: entry.id,
    displayName: entry.display_name,
    category,
    blocksLos: entry.blocks_los,
    spotPenalty: entry.spot_penalty,
    color: entry.render.color,
    height: entry.render.height,
  };
  if (entry.render.footprint !== undefined) doc.footprint = entry.render.footprint;
  if (entry.render.model) doc.model = modelToDoc(entry.render.model);
  if (entry.render.sprite) doc.sprite = { ...entry.render.sprite };
  return doc;
}

/** MapEntry -> MapDoc, for reopening an existing map to keep editing it. */
export function entryToMapDoc(entry: MapEntry): MapDoc {
  return {
    id: entry.id,
    displayName: entry.display_name,
    cols: entry.cols,
    rows: entry.rows,
    deployZoneCols: entry.deploy_zone_cols,
    deployMinSeparation: entry.deploy_min_separation,
    cells: entry.terrain.map((c) => ({ q: c.hex[0], r: c.hex[1], kind: c.type })),
  };
}
