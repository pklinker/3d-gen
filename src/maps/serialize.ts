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
