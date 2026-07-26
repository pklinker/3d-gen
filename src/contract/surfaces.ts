import type { MeshContract } from "./constants";

/**
 * Surface finishes — the PBR half of a material slot.
 *
 * A mesh contract carries one metalness/roughness pair, which describes an artifact's
 * *dominant* surface. That is too coarse for anything assembled from parts: a battleship's
 * oiled timber hull, brass prow fittings, gunmetal barrels and cloth pennant are not the
 * same material, and flattening them to one loses most of what distinguishes them.
 *
 * A finish overrides that pair for a range of triangles. The builders already bracket every
 * part with `I.length` for `paintRange`, so the ranges exist — see `applySurfaces()` in
 * `generation/primitives.ts`, which turns them into geometry groups. `GLTFExporter` emits
 * one glTF primitive per group, so a multi-finish mesh exports as ordinary glTF with no
 * extension.
 *
 * Note that `metal`, `brass` and `glass` are all under-selling themselves until the viewport
 * grows an environment map (TODO_REALISM.md §6): a metallic surface puts its energy into a
 * reflection of the environment, and with no environment to reflect, that energy is simply
 * lost. They still read correctly relative to each other; they just read dark.
 */
export type SurfaceFinish =
  | "default"
  | "stone"
  | "timber"
  | "metal"
  | "brass"
  | "glass"
  | "fabric";

/**
 * Fixed global ordering. A group's `materialIndex` is an index into this list, so slot 3
 * means `metal` in every artifact and `makeContractMaterial()` can stay stateless — it
 * builds the same array for any mesh and lets the groups pick. Entries no group references
 * are never touched by the exporter, so the unused ones cost nothing in the `.glb`.
 *
 * Append only: renumbering would silently repaint every artifact that carries groups.
 */
export const SURFACE_ORDER: readonly SurfaceFinish[] = [
  "default", "stone", "timber", "metal", "brass", "glass", "fabric",
] as const;

export function surfaceIndex(finish: SurfaceFinish): number {
  const i = SURFACE_ORDER.indexOf(finish);
  return i < 0 ? 0 : i;
}

interface FinishSpec {
  metalness: number;
  roughness: number;
}

/** `default` is absent — it resolves to the contract's own pair. */
const FINISHES: Record<Exclude<SurfaceFinish, "default">, FinishSpec> = {
  // Dry mineral: sandstone, marble, rock. No specular character at all.
  stone: { metalness: 0, roughness: 0.95 },
  // Oiled hull timber and deck planking — matte, but oiled enough to hold a soft sheen.
  timber: { metalness: 0, roughness: 0.72 },
  // Gunmetal and structural steel: barrels, masts, nacelles, gantries.
  metal: { metalness: 0.85, roughness: 0.45 },
  // Polished brass: instrument barrels, cockpit fittings, prow ornament. The one genuinely
  // shiny surface in the palette, so it should stay rare enough to still read as an accent.
  brass: { metalness: 0.9, roughness: 0.22 },
  // Canopy glazing. Deliberately opaque: at the ~256px the game blits, a transparent canopy
  // reads as a hole rather than as glass, and it drags sorting complexity into the bake for
  // nothing. Smooth and dielectric is what makes it read — the tight highlight, not the
  // see-through.
  glass: { metalness: 0, roughness: 0.06 },
  // Pennants and awnings — the most diffuse thing on any model.
  fabric: { metalness: 0, roughness: 1 },
};

/** Resolve a finish to its PBR pair, falling back to the contract for `default`. */
export function finishSpec(finish: SurfaceFinish, contract: MeshContract): FinishSpec {
  if (finish === "default") {
    return { metalness: contract.metalness, roughness: contract.roughness };
  }
  return FINISHES[finish];
}
