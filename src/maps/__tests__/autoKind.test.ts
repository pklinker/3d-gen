import { describe, expect, it } from "vitest";
import { deriveKindDocFromArtifact } from "../autoKind";

describe("deriveKindDocFromArtifact — mesh (terrain)", () => {
  it("derives a paintable kind from the hill generator", () => {
    const doc = deriveKindDocFromArtifact("hill");
    expect(doc.id).toBe("hill");
    expect(doc.displayName).toBe("Hill / Mesa");
    expect(doc.category).toBe("terrain");
    expect(doc.generatorType).toBe("hill");
    expect(doc.model).toBeDefined();
    expect(doc.sprite).toBeUndefined();
    expect(doc.color).toHaveLength(4);
  });

  it("model.dir follows the category (terrain vs building)", () => {
    expect(deriveKindDocFromArtifact("hill").model?.dir).toBe("terrain");
    expect(deriveKindDocFromArtifact("tower").model?.dir).toBe("buildings");
  });

  it("a buildings-category artifact gets category 'building'", () => {
    expect(deriveKindDocFromArtifact("tower").category).toBe("building");
    expect(deriveKindDocFromArtifact("radarDish").category).toBe("building");
  });

  it("a terrain-category artifact gets category 'terrain'", () => {
    expect(deriveKindDocFromArtifact("mountain").category).toBe("terrain");
    expect(deriveKindDocFromArtifact("mossdunes").category).toBe("terrain");
  });

  it("camelCase artifact types slugify to snake_case ids", () => {
    expect(deriveKindDocFromArtifact("mooringSpire").id).toBe("mooring_spire");
    expect(deriveKindDocFromArtifact("broadcastTower").id).toBe("broadcast_tower");
    expect(deriveKindDocFromArtifact("radarDish").id).toBe("radar_dish");
  });

  it("render tuning is derived from the artifact's own contract, not a fixed constant", () => {
    const hill = deriveKindDocFromArtifact("hill");
    const tower = deriveKindDocFromArtifact("tower");
    // Different contracts (different height/footprint) must yield different tuning.
    expect(hill.model?.frame).not.toBe(tower.model?.frame);
    expect(hill.height).not.toBe(tower.height);
  });
});

describe("deriveKindDocFromArtifact — effect (sprite)", () => {
  it("derives a sprite-backed kind from an effect generator", () => {
    const doc = deriveKindDocFromArtifact("duststorm");
    expect(doc.id).toBe("duststorm");
    expect(doc.category).toBe("terrain");
    expect(doc.model).toBeUndefined();
    expect(doc.sprite).toBeDefined();
    expect(doc.sprite?.prefix).toBe("duststorm");
    expect(doc.blocksLos).toBe(false);
  });

  it("picks up the generator's own default color param when it has one", () => {
    const doc = deriveKindDocFromArtifact("duststorm");
    // duststormDef's default color param is "#C9A66B" -> rgba
    expect(doc.color[0]).toBeGreaterThan(0.5); // reddish/tan, not the neutral fallback's mid-gray-brown check alone
  });

  it("every effect artifact derives without throwing", () => {
    for (const t of ["heathaze", "radiumstorm", "smoke", "gascloud"] as const) {
      expect(() => deriveKindDocFromArtifact(t)).not.toThrow();
    }
  });
});

describe("deriveKindDocFromArtifact — every terrain/buildings/effects type derives cleanly", () => {
  const types = [
    "hill", "mountain", "rift", "mossdunes", "spires",
    "tower", "atmosphere", "ramparts", "mooringSpire", "landingStage", "pumpStation",
    "observatory", "incubator", "skyVilla", "broadcastTower", "aaTurret",
    "radarDish", "radarDome", "radarArray",
    "duststorm", "heathaze", "radiumstorm", "smoke", "gascloud",
  ] as const;

  it("derives a doc with a non-empty id and displayName for every type", () => {
    for (const t of types) {
      const doc = deriveKindDocFromArtifact(t);
      expect(doc.id.length).toBeGreaterThan(0);
      expect(doc.displayName.length).toBeGreaterThan(0);
    }
  });

  it("every id is unique across the full set (no slug collisions)", () => {
    const ids = types.map((t) => deriveKindDocFromArtifact(t).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
