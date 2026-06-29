// Client for the dev-server save endpoint (vite-plugin-savefiles). When the dev
// server is running, the editor can write straight into the game's asset dirs;
// otherwise these calls reject and the UI falls back to browser download.

import type { ArtifactCategory } from "../types";

export const CATEGORY_DIRS: Record<ArtifactCategory, string> = {
  buildings: "assets/buildings",
  ships: "assets/ships",
  effects: "assets/effects",
  terrain: "assets/terrain",
};

export interface SaveTarget {
  gameDir: string;
  reachable: boolean;
}

export interface AppSettings {
  gameDir: string;
}

export async function getTarget(): Promise<SaveTarget | null> {
  try {
    const r = await fetch("/api/target");
    if (!r.ok) return null;
    return (await r.json()) as SaveTarget;
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const r = await fetch("/api/settings");
    if (!r.ok) return null;
    return (await r.json()) as AppSettings;
  } catch {
    return null;
  }
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "settings update failed");
  return j.settings as AppSettings;
}

export interface OutFile {
  name: string;
  data: ArrayBuffer | Blob | string;
}
export interface CreditEntry {
  file: string;
  note: string;
}

async function toBase64(data: ArrayBuffer | Blob | string): Promise<string> {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Blob) {
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    bytes = new Uint8Array(data);
  }
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function saveToGame(
  files: OutFile[],
  credits: CreditEntry[],
  category: ArtifactCategory,
): Promise<{ dir: string; written: string[] }> {
  const payload = {
    files: await Promise.all(
      files.map(async (f) => ({ name: f.name, dataBase64: await toBase64(f.data) })),
    ),
    credits,
    category,
  };
  const r = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "save failed");
  return { dir: j.dir, written: j.written };
}
