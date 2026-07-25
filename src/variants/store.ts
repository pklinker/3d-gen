// Client for the variant store (vite-plugin-savefiles.ts /api/variants,
// /api/delete-variant). The dev server owns the real store — data/variants.json
// in this repo — so a saved variant survives a reload, a browser change and a
// `git clone`, which a localStorage-only store never did.
//
// localStorage is kept as a MIRROR, not a second source of truth: every
// successful server read/write refreshes it, and it is only ever read when the
// dev endpoints aren't there (a `vite preview`/static build, where nothing can
// write files). `persisted` in the result says which of the two answered, so
// the UI can tell the user their variants are browser-local rather than
// silently pretending they're on disk.

import { upsertById } from "../maps/merge";
import type { ArtifactVariant, VariantsFile } from "./types";

const MIRROR_KEY = "3d-gen.variants.mirror";

export interface VariantList {
  variants: ArtifactVariant[];
  /** true = came from (and writes go to) data/variants.json on disk. */
  persisted: boolean;
}

function readMirror(): ArtifactVariant[] {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    const list = raw ? (JSON.parse(raw) as ArtifactVariant[]) : [];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === "string") : [];
  } catch {
    return [];
  }
}

function writeMirror(variants: ArtifactVariant[]): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(variants));
  } catch {
    /* storage disabled or full — the server copy is the real one anyway */
  }
}

function sorted(variants: ArtifactVariant[]): ArtifactVariant[] {
  return [...variants].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Every saved variant. Never throws: with no dev server this falls back to
 *  the browser mirror, which is a normal state for a static build. */
export async function listVariants(): Promise<VariantList> {
  try {
    const r = await fetch("/api/variants");
    if (!r.ok) throw new Error(String(r.status));
    const { variants } = (await r.json()) as VariantsFile;
    writeMirror(variants);
    return { variants: sorted(variants), persisted: true };
  } catch {
    return { variants: sorted(readMirror()), persisted: false };
  }
}

/** Add or replace a variant by id. */
export async function saveVariant(entry: ArtifactVariant): Promise<VariantList> {
  try {
    const r = await fetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string; variants?: ArtifactVariant[] };
    if (!j.ok || !j.variants) throw new Error(j.error || "save failed");
    writeMirror(j.variants);
    return { variants: sorted(j.variants), persisted: true };
  } catch {
    const variants = upsertById(readMirror(), entry);
    writeMirror(variants);
    return { variants: sorted(variants), persisted: false };
  }
}

export async function deleteVariant(id: string): Promise<VariantList> {
  try {
    const r = await fetch("/api/delete-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string; variants?: ArtifactVariant[] };
    if (!j.ok || !j.variants) throw new Error(j.error || "delete failed");
    writeMirror(j.variants);
    return { variants: sorted(j.variants), persisted: true };
  } catch {
    const variants = readMirror().filter((v) => v.id !== id);
    writeMirror(variants);
    return { variants: sorted(variants), persisted: false };
  }
}
