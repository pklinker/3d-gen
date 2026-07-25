import { describe, expect, it } from "vitest";
import { groupPalette } from "../paletteGroups";
import { GOLDEN_KIND_DOCS } from "../paletteBuiltins";
import type { TerrainKindDoc } from "../types";

describe("groupPalette", () => {
  it("groups the golden kinds into Terrain / Buildings / Effects by their real artifact category", () => {
    // hill -> terrain, tower -> buildings, dust_storm -> effects (duststorm's
    // registry category), even though dust_storm's own doc.category is "terrain".
    const sections = groupPalette(GOLDEN_KIND_DOCS);
    const byLabel = new Map(sections.map((s) => [s.label, s.kinds.map((k) => k.id)]));
    expect(byLabel.get("Terrain")).toEqual(["hill"]);
    expect(byLabel.get("Buildings")).toEqual(["tower"]);
    expect(byLabel.get("Effects")).toEqual(["dust_storm"]);
  });

  it("omits empty sections", () => {
    const onlyHill = GOLDEN_KIND_DOCS.filter((k) => k.id === "hill");
    const sections = groupPalette(onlyHill);
    expect(sections.map((s) => s.label)).toEqual(["Terrain"]);
  });

  it("sorts each section's kinds alphabetically by display name, regardless of input order", () => {
    const custom: TerrainKindDoc = {
      id: "custom_deco",
      displayName: "Amber Grove", // sorts before "Hill"
      category: "terrain",
      blocksLos: false,
      spotPenalty: 0,
      color: [0.5, 0.5, 0.5, 1],
      height: 0,
    };
    // No generatorType and no BUILTIN_KIND_ARTIFACT entry -> falls back to
    // doc.category, so this lands in Terrain alongside hill.
    const sections = groupPalette([...GOLDEN_KIND_DOCS.filter((k) => k.id === "hill"), custom]);
    const terrain = sections.find((s) => s.label === "Terrain");
    expect(terrain?.kinds.map((k) => k.id)).toEqual(["custom_deco", "hill"]);
  });

  it("a hand-authored building decoration (no generator) falls back to doc.category", () => {
    const customBuilding: TerrainKindDoc = {
      id: "custom_building",
      displayName: "Custom Building",
      category: "building",
      blocksLos: true,
      spotPenalty: 0,
      color: [0.5, 0.5, 0.5, 1],
      height: 1,
    };
    const sections = groupPalette([customBuilding]);
    expect(sections.map((s) => s.label)).toEqual(["Buildings"]);
  });
});
