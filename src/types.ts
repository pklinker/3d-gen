import type { ArtifactType, ContractKey, OutputKind } from "./contract/constants";

export type { ArtifactType, ContractKey, OutputKind };

/** Top-level grouping shown as category tabs in the editor. */
export type ArtifactCategory = "terrain" | "buildings" | "ships" | "ordnance" | "effects";

/** A single tunable parameter exposed in the param panel. */
export interface ParamSpec {
  key: string;
  label: string;
  kind: "number" | "int" | "bool" | "color";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean | string;
}

export type ParamValues = Record<string, number | boolean | string>;

/** Result of a mesh generator: a single geometry plus the chosen base color. */
export interface GeneratedMesh {
  kind: "mesh";
  geometry: import("three").BufferGeometry;
  color: string;
}

/** Result of an effect generator: draws a single animation frame to a canvas. */
export interface GeneratedEffect {
  kind: "effect";
  /** Number of frames in the loop. */
  frameCount: number;
  /** Pixel size of each square frame. */
  frameSize: number;
  /** Draw frame `i` (0..frameCount-1) into ctx at the given size. */
  drawFrame: (ctx: CanvasRenderingContext2D, frame: number, size: number) => void;
}

export type GeneratorResult = GeneratedMesh | GeneratedEffect;

/** Registry entry describing one artifact type. */
export interface ArtifactDef {
  type: ArtifactType;
  label: string;
  /** Category tab this artifact lives under. */
  category: ArtifactCategory;
  output: OutputKind;
  /** Which mesh contract this is conformed/validated against (mesh types only). */
  contract?: ContractKey;
  params: ParamSpec[];
  /** seed + params -> geometry or effect. Deterministic. */
  generate: (seed: number, params: ParamValues) => GeneratorResult;
  /** Default filename stem, e.g. "hill". Variant slot is appended. */
  fileStem: string;
  /** Default AI prompt seed (mesh types only). */
  promptSeed?: string;
  /** Optional subcategory id — enables a third level in the artifact tree. */
  subcategory?: string;
  /**
   * Widest edge, in degrees, that the conform pass still smooths — everything sharper stays
   * faceted. Set it on generators built from turned forms (shafts, domes, barrels, hulls),
   * where hard-shading a 6- or 8-sided lathe reads as a lumpy stick at in-game size. 65 is
   * the useful general value: above every turned surface the primitives produce, below a box
   * corner. Omit to keep the artifact fully faceted — which is what terrain wants, since the
   * faceted rock *is* the style.
   */
  smoothAngleDeg?: number;
}

export function defaultParams(specs: ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}
