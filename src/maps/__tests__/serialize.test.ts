import { describe, expect, it } from "vitest";
import { kindDocToEntry, mapDocToEntry } from "../serialize";
import {
  GOLDEN_DEAD_SEA_BOTTOM_DOC,
  GOLDEN_DEAD_SEA_BOTTOM_ENTRY,
  GOLDEN_DUST_STORM_DOC,
  GOLDEN_DUST_STORM_ENTRY,
  GOLDEN_HILL_DOC,
  GOLDEN_HILL_ENTRY,
  GOLDEN_STORM_FRONT_DOC,
  GOLDEN_STORM_FRONT_ENTRY,
  GOLDEN_TOWER_DOC,
  GOLDEN_TOWER_ENTRY,
} from "../__fixtures__/golden";
import type { MapDoc, TerrainKindDoc } from "../types";

// The golden-fixture round-trip (MAP_MODDING.md §0.10): every core map/kind
// mirrors flyers' shipped data/*.json exactly. This is what catches schema
// drift between this editor and the game as a failing test, not a silent
// mismatch discovered at runtime in Godot.
describe("mapDocToEntry — golden fixtures", () => {
  it("reproduces dead_sea_bottom exactly", () => {
    expect(mapDocToEntry(GOLDEN_DEAD_SEA_BOTTOM_DOC)).toEqual(GOLDEN_DEAD_SEA_BOTTOM_ENTRY);
  });

  it("reproduces storm_front exactly", () => {
    expect(mapDocToEntry(GOLDEN_STORM_FRONT_DOC)).toEqual(GOLDEN_STORM_FRONT_ENTRY);
  });
});

describe("kindDocToEntry — golden fixtures", () => {
  it("reproduces hill exactly (model-backed)", () => {
    expect(kindDocToEntry(GOLDEN_HILL_DOC)).toEqual(GOLDEN_HILL_ENTRY);
  });

  it("reproduces tower exactly (model-backed, footprint override, building category)", () => {
    expect(kindDocToEntry(GOLDEN_TOWER_DOC)).toEqual(GOLDEN_TOWER_ENTRY);
  });

  it("reproduces dust_storm exactly (sprite-backed)", () => {
    expect(kindDocToEntry(GOLDEN_DUST_STORM_DOC)).toEqual(GOLDEN_DUST_STORM_ENTRY);
  });
});

describe("mapDocToEntry — shape", () => {
  it("maps each cell's {q, r, kind} to {hex: [q, r], type: kind}", () => {
    const doc: MapDoc = {
      id: "t",
      displayName: "T",
      cols: 10,
      rows: 10,
      deployZoneCols: 4,
      deployMinSeparation: 2,
      cells: [{ q: 3, r: 9, kind: "hill" }],
    };
    expect(mapDocToEntry(doc).terrain).toEqual([{ hex: [3, 9], type: "hill" }]);
  });

  it("produces an empty terrain array for a map with no cells", () => {
    const doc: MapDoc = {
      id: "blank",
      displayName: "Blank",
      cols: 10,
      rows: 10,
      deployZoneCols: 4,
      deployMinSeparation: 2,
      cells: [],
    };
    expect(mapDocToEntry(doc).terrain).toEqual([]);
  });
});

describe("kindDocToEntry — optional render fields", () => {
  const base: TerrainKindDoc = {
    id: "plain",
    displayName: "Plain",
    category: "terrain",
    blocksLos: false,
    spotPenalty: 0,
    color: [1, 1, 1, 1],
    height: 0,
  };

  it("a kind with neither model nor sprite omits both render keys (procedural fallback)", () => {
    const render = kindDocToEntry(base).render;
    expect(render).not.toHaveProperty("model");
    expect(render).not.toHaveProperty("sprite");
    expect(render).not.toHaveProperty("footprint");
  });

  it("footprint is included only when set", () => {
    expect(kindDocToEntry({ ...base, footprint: 0.3 }).render.footprint).toBe(0.3);
    expect(kindDocToEntry(base).render.footprint).toBeUndefined();
  });

  it("a sprite without an explicit dir omits dir (game defaults to terrain/)", () => {
    const withSprite = kindDocToEntry({
      ...base,
      sprite: { prefix: "haze", span: 1.5, anchor: 0.5 },
    });
    expect(withSprite.render.sprite).toEqual({ prefix: "haze", span: 1.5, anchor: 0.5 });
    expect(withSprite.render.sprite).not.toHaveProperty("dir");
  });

  it("a sprite with an explicit dir carries it through", () => {
    const withSprite = kindDocToEntry({
      ...base,
      sprite: { prefix: "haze", span: 1.5, anchor: 0.5, dir: "buildings" },
    });
    expect(withSprite.render.sprite).toEqual({
      prefix: "haze",
      span: 1.5,
      anchor: 0.5,
      dir: "buildings",
    });
  });
});
