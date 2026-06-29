import type { ArtifactType, ContractKey, OutputKind } from "./contract/constants";

export type { ArtifactType, ContractKey, OutputKind };

/** Top-level grouping shown as category tabs in the editor. */
export type ArtifactCategory = "terrain" | "buildings" | "effects";

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
}

export function defaultParams(specs: ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}
