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
  dustStormDef,
  heatHazeDef,
  radiumStormDef,
];

export interface CategoryDef {
  id: ArtifactCategory;
  label: string;
}

/** Category tabs, in display order. Add a new category here, then tag artifacts. */
export const CATEGORIES: CategoryDef[] = [
  { id: "terrain", label: "Terrain" },
  { id: "buildings", label: "Buildings" },
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
