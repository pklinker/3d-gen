import * as THREE from "three";
import { getArtifact } from "../artifacts/registry";
import { conformGeometry, makeContractMaterial } from "../generation/conform";
import { defaultParams } from "../types";
import { BUILTIN_KIND_ARTIFACT } from "./paletteBuiltins";
import type { TerrainKindDoc } from "./types";

export interface KindMesh {
  geometry: THREE.BufferGeometry;
  /** An array when the kind's mesh carries surface groups — one material per finish slot. */
  material: THREE.Material | THREE.Material[];
}

/** Build the preview mesh for a kind's bound generator — an existing artifact
 *  from the registry (hillDef, towerDef, a building def…), exactly as
 *  MAP_MODDING.md §6.1 asks: "preview each painted kind using its existing
 *  generator… so the map preview shows the actual in-game assets."
 *
 *  Deterministic, but not necessarily at the generator's defaults: a kind saved
 *  as a variant (src/variants/) carries its own seed + params, which is what
 *  lets three moss-dunes variants paint as three visibly different meshes
 *  instead of three copies of the stock one. A kind without them keeps the
 *  original behaviour (seed 1, default params) — a map cell only ever needs
 *  "what this kind looks like," not per-cell variation.
 *
 *  Returns null for a kind with no bound generator, or one whose generator is
 *  effect-output (dust, gas clouds…) — the game plays those as an animated
 *  sprite, not a 3D mesh; MapViewport draws its flat colored-tile fallback for
 *  both cases, mirroring ModelBaker's own "no model -> procedural fallback." */
export function buildKindMesh(kind: TerrainKindDoc): KindMesh | null {
  const artifactType = kind.generatorType ?? BUILTIN_KIND_ARTIFACT[kind.id];
  if (!artifactType) return null;
  const def = getArtifact(artifactType);
  if (def.output !== "mesh") return null;

  // Variant params layer over the defaults rather than replacing them, so a
  // variant saved before a generator gained a param still builds (the new
  // param takes its default instead of arriving undefined).
  const baseParams = { ...defaultParams(def.params), ...kind.generatorParams };
  const genParams =
    def.category === "buildings" ? { ornament: 0.4, ...baseParams } : baseParams;
  const res = def.generate(kind.generatorSeed ?? 1, genParams);
  const rawGeometry = (res as { geometry: THREE.BufferGeometry }).geometry;

  const contract = def.contract ?? "hill";
  const { geometry } = conformGeometry(rawGeometry, contract, {
    fitToHex: true,
    category: def.category,
    smoothAngleDeg: def.smoothAngleDeg,
  });
  const material = makeContractMaterial(contract, geometry);
  return { geometry, material };
}
