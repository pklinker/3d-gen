import { describe, expect, it } from "vitest";
import { BUILTIN_KIND_ARTIFACT, BUILTIN_KIND_DOCS, GOLDEN_KIND_DOCS } from "../paletteBuiltins";
import { GOLDEN_DUST_STORM_DOC, GOLDEN_HILL_DOC, GOLDEN_TOWER_DOC } from "../__fixtures__/golden";

describe("BUILTIN_KIND_DOCS — the out-of-the-box palette", () => {
  it("includes every terrain, buildings, and effects artifact (not just the three shipped kinds)", () => {
    // 5 terrain + 14 buildings + 5 effects = 24 registry artifacts in scope,
    // deduplicated to distinct kind ids (hill/tower/duststorm collapse onto
    // their golden equivalents rather than double-counting).
    expect(BUILTIN_KIND_DOCS.length).toBe(24);
  });

  it("excludes ships and ordnance — those are placed vessels/weapons, not map terrain", () => {
    const ids = BUILTIN_KIND_DOCS.map((d) => d.id);
    for (const shipOrWeapon of ["fighter", "attack", "scout", "cruiser", "battleship", "missile", "bomb", "torpedo"]) {
      expect(ids).not.toContain(shipOrWeapon);
    }
  });

  it("the golden three win their exact pinned values — auto-derivation never overrides them", () => {
    const byId = new Map(BUILTIN_KIND_DOCS.map((d) => [d.id, d]));
    expect(byId.get("hill")).toEqual(GOLDEN_HILL_DOC);
    expect(byId.get("tower")).toEqual(GOLDEN_TOWER_DOC);
    expect(byId.get("dust_storm")).toEqual(GOLDEN_DUST_STORM_DOC);
  });

  it("a newly added artifact type would need to appear here too (sanity: some known ids present)", () => {
    const ids = BUILTIN_KIND_DOCS.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["mountain", "rift", "mossdunes", "spires"]));
    expect(ids).toEqual(
      expect.arrayContaining([
        "atmosphere", "ramparts", "mooring_spire", "landing_stage", "pump_station",
        "observatory", "incubator", "sky_villa", "broadcast_tower", "aa_turret",
        "radar_dish", "radar_dome", "radar_array",
      ]),
    );
    expect(ids).toEqual(expect.arrayContaining(["heathaze", "radiumstorm", "smoke", "gascloud"]));
  });

  it("every non-golden kind carries a generatorType so the painter can preview it", () => {
    const nonGolden = BUILTIN_KIND_DOCS.filter((d) => !GOLDEN_KIND_DOCS.some((g) => g.id === d.id));
    for (const d of nonGolden) {
      expect(d.generatorType).toBeDefined();
    }
  });
});

describe("BUILTIN_KIND_ARTIFACT — golden-kind generator lookup", () => {
  it("maps each golden kind id to its generator artifact type", () => {
    expect(BUILTIN_KIND_ARTIFACT.hill).toBe("hill");
    expect(BUILTIN_KIND_ARTIFACT.tower).toBe("tower");
    expect(BUILTIN_KIND_ARTIFACT.dust_storm).toBe("duststorm");
  });
});
