import { getArtifact } from "../artifacts/registry";
import { MESH_CONTRACTS } from "../contract/constants";
import { defaultParams } from "../types";
import { hexToRgba } from "./color";
import type { ArtifactType } from "../types";
import type { TerrainKindDoc } from "./types";

function slugify(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase -> camel_Case
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Heuristic bake-camera framing for a mesh contract — the same numbers
 *  KindForm.pickGenerator seeds into its editable frame/span/lookY/anchor
 *  fields. Not exact (these are cosmetic camera-framing values, not derivable
 *  purely from geometry bounds), but a reasonable starting point a modder can
 *  WYSIWYG-tune against the real mesh in the painter (§0.13). */
function frameTuning(footprint: number, height: number) {
  return {
    frame: height * 1.3 + footprint * 0.5,
    span: footprint * 1.05,
    lookY: height * 0.4,
    anchor: 0.55,
  };
}

/** Derive a paintable TerrainKindDoc from any registry artifact — the single
 *  place that turns "an existing mesh/effect generator" into "a terrain kind
 *  with rules + render tuning", shared by KindForm's manual picker and the
 *  auto-populated palette (paletteBuiltins.ts) so the two never drift.
 *
 *  Rule defaults are coarse (every mesh-backed kind blocks LOS, every effect
 *  doesn't) since there is no principled way to guess "does a rift block a
 *  shot?" from geometry alone — a modder tunes these per kind afterward, the
 *  same way KindForm always left them editable rather than hard-coding them. */
export function deriveKindDocFromArtifact(type: ArtifactType): TerrainKindDoc {
  const def = getArtifact(type);
  const category: "terrain" | "building" = def.category === "buildings" ? "building" : "terrain";
  const id = slugify(type);

  if (def.output === "mesh") {
    const C = MESH_CONTRACTS[def.contract ?? "hill"];
    return {
      id,
      displayName: def.label,
      category,
      blocksLos: true,
      spotPenalty: 0,
      color: hexToRgba(C.color),
      height: C.height,
      footprint: Math.min(1, C.footprint / 2),
      model: {
        dir: category === "building" ? "buildings" : "terrain",
        prefix: def.fileStem,
        ...frameTuning(C.footprint, C.height),
      },
      generatorType: type,
    };
  }

  // Effect (sprite-backed): reuse the artifact's own default color param if it
  // has one (most effects expose a "color" ParamSpec), else a neutral haze tint.
  const params = defaultParams(def.params);
  const colorParam = def.params.find((p) => p.kind === "color");
  const color = colorParam ? String(params[colorParam.key]) : "#a08850";
  return {
    id,
    displayName: def.label,
    category: "terrain",
    blocksLos: false,
    spotPenalty: 1,
    color: hexToRgba(color),
    height: 0,
    sprite: { prefix: def.fileStem, span: 1.8, anchor: 0.62, dir: "terrain" },
    generatorType: type,
  };
}
