import { describe, expect, it } from "vitest";
import { deriveKindDocFromArtifact } from "../../maps/autoKind";
import { variantId, variantToKindDoc } from "../toKind";
import type { ArtifactVariant } from "../types";

function mossVariant(over: Partial<ArtifactVariant> = {}): ArtifactVariant {
  return {
    id: "moss_dry",
    displayName: "Dry Moss Dunes",
    type: "mossdunes",
    seed: 42,
    params: { height: 0.2, frequency: 7, crest: 0.9, overgrowth: 2, mossColor: "#c8b070" },
    savedAt: 0,
    ...over,
  };
}

describe("variantId", () => {
  it("slugifies a display name into a kind id / file stem", () => {
    expect(variantId("Dry Moss Dunes")).toBe("dry_moss_dunes");
    expect(variantId("  Spire —— 3! ")).toBe("spire_3");
  });

  it("is empty for a name with nothing usable in it (caller rejects the save)", () => {
    expect(variantId("!!!")).toBe("");
  });
});

describe("variantToKindDoc", () => {
  it("keeps the variant's own identity rather than the generator's", () => {
    const doc = variantToKindDoc(mossVariant());
    const stock = deriveKindDocFromArtifact("mossdunes");
    expect(doc.id).toBe("moss_dry");
    expect(doc.displayName).toBe("Dry Moss Dunes");
    expect(stock.id).not.toBe(doc.id); // three variants -> three distinct kinds
  });

  it("carries seed + params through so the painter previews THAT tuning", () => {
    const doc = variantToKindDoc(mossVariant());
    expect(doc.generatorType).toBe("mossdunes");
    expect(doc.generatorSeed).toBe(42);
    expect(doc.generatorParams).toMatchObject({ frequency: 7, crest: 0.9 });
  });

  it("points render.model at the variant's own exported asset stem", () => {
    expect(variantToKindDoc(mossVariant()).model?.prefix).toBe("moss_dry");
    expect(deriveKindDocFromArtifact("mossdunes").model?.prefix).toBe("mossdunes");
  });

  it("takes the swatch color from the variant's tuned color param", () => {
    const tinted = variantToKindDoc(mossVariant({ params: { mossColor: "#000000" } }));
    expect(tinted.color.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("falls back to the derived color when the variant tuned no color param", () => {
    const doc = variantToKindDoc(mossVariant({ params: { frequency: 3 } }));
    expect(doc.color).toEqual(deriveKindDocFromArtifact("mossdunes").color);
  });

  it("inherits the generator's rules/framing defaults (one derivation, no drift)", () => {
    const doc = variantToKindDoc(mossVariant());
    const stock = deriveKindDocFromArtifact("mossdunes");
    expect(doc.category).toBe(stock.category);
    expect(doc.blocksLos).toBe(stock.blocksLos);
    expect(doc.height).toBe(stock.height);
    expect(doc.model?.frame).toBe(stock.model?.frame);
  });

  it("routes an effect-backed variant through render.sprite, not render.model", () => {
    const doc = variantToKindDoc(mossVariant({ id: "thick_dust", type: "duststorm", params: {} }));
    expect(doc.sprite?.prefix).toBe("thick_dust");
    expect(doc.model).toBeUndefined();
  });
});
