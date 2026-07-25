// variant -> paintable terrain kind. This is the seam that makes a saved
// variant show up in the Maps palette: it reuses autoKind's derivation (the
// same heuristic the auto-populated palette uses, so rules/framing defaults
// never drift between the two) and then overrides the four things that make a
// variant distinct from its generator's stock kind:
//
//   id / displayName — the variant's own, so three moss-dunes variants are
//                      three separate palette entries and three terrain.json
//                      kinds rather than fighting over one `moss_dunes` id.
//   render prefix    — the variant id, so the kind points at the .glb the
//                      Artifacts tab exports for THAT variant (moss_dry_1.glb),
//                      not the generator's stock stem.
//   color            — read from the variant's own tuned color param when it
//                      has one, so the palette swatch matches what was authored.
//   generator*       — seed + params, so the painter previews the tuned mesh
//                      (kindMesh.ts) instead of the generator's defaults.

import { getArtifact } from "../artifacts/registry";
import { deriveKindDocFromArtifact } from "../maps/autoKind";
import { hexToRgba } from "../maps/color";
import type { TerrainKindDoc } from "../maps/types";
import type { ArtifactVariant } from "./types";

/** Variant display name -> id. The id is also the terrain-kind id and the
 *  exported asset's file stem, so it has to survive all three: lowercase,
 *  underscore-separated, no leading/trailing junk (same rule KindForm applies
 *  to hand-authored kind ids). */
export function variantId(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The variant's authored fill color, if its generator exposes one. Prefers a
 *  "base"-ish color param (hill/mesa expose baseColor + topColor; the base
 *  reads as the kind's body color) and falls back to the first color param. */
function variantColor(variant: ArtifactVariant): string | null {
  const specs = getArtifact(variant.type).params.filter((p) => p.kind === "color");
  const spec = specs.find((p) => /base/i.test(p.key)) ?? specs[0];
  if (!spec) return null;
  const v = variant.params[spec.key];
  return typeof v === "string" ? v : null;
}

export function variantToKindDoc(variant: ArtifactVariant): TerrainKindDoc {
  const base = deriveKindDocFromArtifact(variant.type);
  const color = variantColor(variant);
  const doc: TerrainKindDoc = {
    ...base,
    id: variant.id,
    displayName: variant.displayName,
    color: color ? hexToRgba(color) : base.color,
    generatorType: variant.type,
    generatorSeed: variant.seed,
    generatorParams: variant.params,
  };
  if (base.model) doc.model = { ...base.model, prefix: variant.id };
  if (base.sprite) doc.sprite = { ...base.sprite, prefix: variant.id };
  return doc;
}
