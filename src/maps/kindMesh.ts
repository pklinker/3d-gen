import * as THREE from "three";
import { getArtifact } from "../artifacts/registry";
import { conformGeometry, makeContractMaterial } from "../generation/conform";
import { defaultParams } from "../types";
import { BUILTIN_KIND_ARTIFACT } from "./paletteBuiltins";
import type { TerrainKindDoc } from "./types";

export interface KindMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Build the preview mesh for a kind's bound generator — an existing artifact
 *  from the registry (hillDef, towerDef, a building def…), exactly as
 *  MAP_MODDING.md §6.1 asks: "preview each painted kind using its existing
 *  generator… so the map preview shows the actual in-game assets." Deterministic
 *  (seed 1, default params) since a map cell only ever needs "what this kind
 *  looks like," not per-cell variation.
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

  const baseParams = defaultParams(def.params);
  const genParams = def.category === "buildings" ? { ...baseParams, ornament: 0.4 } : baseParams;
  const res = def.generate(1, genParams);
  const rawGeometry = (res as { geometry: THREE.BufferGeometry }).geometry;

  const contract = def.contract ?? "hill";
  const { geometry } = conformGeometry(rawGeometry, contract, { fitToHex: true });
  const material = makeContractMaterial(contract);
  return { geometry, material };
}
