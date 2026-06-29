import type { ArtifactCategory, ArtifactDef, ArtifactType } from "../types";
import { hillDef } from "./hill";
import { mountainDef } from "./mountain";
import { riftDef } from "./rift";
import { mossDunesDef } from "./mossdunes";
import { spiresDef } from "./spires";
import { towerDef } from "./tower";
import { atmosphereDef } from "./atmosphere";
import { rampartsDef } from "./ramparts";
import { mooringSpireDef } from "./mooringSpire";
import { landingStageDef } from "./landingStage";
import { pumpStationDef } from "./pumpStation";
import { observatoryDef } from "./observatory";
import { incubatorDef } from "./incubator";
import { skyVillaDef } from "./skyVilla";
import { fighterDef } from "./fighter";
import { attackDef } from "./attack";
import { scoutDef } from "./scout";
import { lightCruiserDef } from "./lightCruiser";
import { cruiserDef } from "./cruiser";
import { dustStormDef } from "./duststorm";
import { heatHazeDef } from "./heathaze";
import { radiumStormDef } from "./radiumstorm";

export const ARTIFACTS: ArtifactDef[] = [
  hillDef,
  mountainDef,
  riftDef,
  mossDunesDef,
  spiresDef,
  towerDef,
  atmosphereDef,
  rampartsDef,
  mooringSpireDef,
  landingStageDef,
  pumpStationDef,
  observatoryDef,
  incubatorDef,
  skyVillaDef,
  fighterDef,
  attackDef,
  scoutDef,
  lightCruiserDef,
  cruiserDef,
  dustStormDef,
  heatHazeDef,
  radiumStormDef,
];

export interface SubcategoryDef {
  id: string;
  label: string;
}

export interface CategoryDef {
  id: ArtifactCategory;
  label: string;
  subcategories?: SubcategoryDef[];
}

export interface CategoryTreeNode {
  category: CategoryDef;
  groups: { subcategory: SubcategoryDef | null; artifacts: ArtifactDef[] }[];
}

/** Category tabs, in display order. Add a new category here, then tag artifacts. */
export const CATEGORIES: CategoryDef[] = [
  { id: "terrain", label: "Terrain" },
  { id: "buildings", label: "Buildings" },
  { id: "ships", label: "Ships" },
  { id: "effects", label: "Effects" },
];

export function getArtifact(type: ArtifactType): ArtifactDef {
  const def = ARTIFACTS.find((a) => a.type === type);
  if (!def) throw new Error(`Unknown artifact type: ${type}`);
  return def;
}

/** Artifacts belonging to a category, in registry order. */
export function artifactsInCategory(category: ArtifactCategory): ArtifactDef[] {
  return ARTIFACTS.filter((a) => a.category === category);
}

/**
 * Full taxonomy tree, grouped by category then subcategory.
 * Artifacts with no subcategory land in a null-keyed group.
 * Adding a new level = set subcategory on the ArtifactDef + declare it in CATEGORIES.
 */
export function groupedTree(): CategoryTreeNode[] {
  return CATEGORIES.map((cat) => {
    const artifacts = artifactsInCategory(cat.id);
    const map = new Map<string | null, ArtifactDef[]>();
    for (const a of artifacts) {
      const key = a.subcategory ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    const groups = [...map.entries()].map(([subId, arts]) => ({
      subcategory: subId
        ? (cat.subcategories?.find((s) => s.id === subId) ?? { id: subId, label: subId })
        : null,
      artifacts: arts,
    }));
    return { category: cat, groups };
  });
}
