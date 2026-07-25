// Single-tuning file interchange: download the current tuning as a .json a
// modder can hand to someone else, and read one back. This is the SHARING
// path only — persistence across reloads is the variant store's job
// (src/variants/store.ts, data/variants.json), since a downloaded file the
// editor never reads again can't be a store.

import type { ArtifactType, ParamValues } from "../types";
import { downloadBlob } from "./gltfExport";

export interface Preset {
  type: ArtifactType;
  seed: number;
  params: ParamValues;
  version: 1;
}

export function savePreset(p: Omit<Preset, "version">, name: string) {
  const data: Preset = { ...p, version: 1 };
  downloadBlob(JSON.stringify(data, null, 2), `${name}.preset.json`, "application/json");
}

export function loadPreset(file: File): Promise<Preset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as Preset;
        if (!p.type || typeof p.seed !== "number") throw new Error("bad preset");
        resolve(p);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
