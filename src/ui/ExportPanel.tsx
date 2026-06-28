import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { exportGlb, downloadBlob } from "../export/gltfExport";
import { exportEffect } from "../export/spriteExport";
import { creditsLine, creditsNote } from "../export/credits";
import { getTarget, saveToGame, type SaveTarget } from "../export/saveToGame";

interface Props {
  def: ArtifactDef;
  seed: number;
  params: ParamValues;
  geometry: THREE.BufferGeometry | null;
  material: THREE.Material | null;
  canExportMesh: boolean;
  source: string; // "procedural" or provider name
  effect: GeneratedEffect | null;
}

export default function ExportPanel({
  def,
  seed,
  params,
  geometry,
  material,
  canExportMesh,
  source,
  effect,
}: Props) {
  const [variant, setVariant] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [toGame, setToGame] = useState(true);

  useEffect(() => {
    getTarget().then(setTarget);
  }, []);

  const stem = `${def.fileStem}_${variant}`;
  const glbName = `${stem}.glb`;
  const canDirect = !!target?.reachable && toGame;

  async function buildOutputs(): Promise<
    { files: { name: string; data: ArrayBuffer | Blob | string }[]; credits: { file: string; note: string }[] }
  > {
    if (def.output === "mesh") {
      const buf = await exportGlb(geometry!, material!);
      return {
        files: [{ name: glbName, data: buf }],
        credits: [{ file: glbName, note: creditsNote(source, seed) }],
      };
    }
    const { png, json } = await exportEffect(effect!, {
      type: def.type,
      seed,
      params: params as Record<string, unknown>,
    });
    return {
      files: [
        { name: `${stem}.png`, data: png },
        { name: `${stem}.json`, data: json },
      ],
      credits: [{ file: `${stem}.png`, note: creditsNote(source, seed) }],
    };
  }

  async function handleExport() {
    setStatus("exporting…");
    try {
      const { files, credits } = await buildOutputs();
      if (canDirect) {
        const res = await saveToGame(files, credits);
        setStatus(`Wrote ${res.written.join(", ")} → ${res.dir}`);
      } else {
        for (const f of files) {
          const mime =
            f.name.endsWith(".glb") ? "model/gltf-binary"
            : f.name.endsWith(".png") ? "image/png"
            : "application/json";
          downloadBlob(f.data as BlobPart, f.name, mime);
        }
        navigator.clipboard
          ?.writeText(creditsLine({ filename: files[0].name, source, seed }))
          .catch(() => {});
        setStatus(`Downloaded ${files.map((f) => f.name).join(", ")} (CREDITS line copied)`);
      }
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`);
    }
  }

  const disabled = def.output === "mesh" ? !canExportMesh : !effect;

  return (
    <div className="export">
      <div className="param-row">
        <label>Variant slot (game scans 1–5)</label>
        <div className="slider">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={variant}
            onChange={(e) => setVariant(Number(e.target.value))}
          />
          <span className="val">{variant}</span>
        </div>
      </div>

      <div className="filename">
        → {glbName}
        {def.output === "effect" ? ` (${stem}.png + .json)` : ""}
      </div>

      <label className="check dest">
        <input
          type="checkbox"
          checked={toGame}
          disabled={!target?.reachable}
          onChange={(e) => setToGame(e.target.checked)}
        />
        Write into game{" "}
        {target?.reachable ? (
          <code title={target.terrainDir}>assets/terrain/</code>
        ) : (
          <span className="muted small">(unreachable — will download)</span>
        )}
      </label>

      <button className="primary" disabled={disabled} onClick={handleExport}>
        {canDirect ? "Export to game" : "Export (download)"}
      </button>
      {def.output === "mesh" && !canExportMesh && (
        <div className="muted small">Export enabled when contract passes.</div>
      )}
      {canDirect && (
        <div className="muted small">
          Open the Godot editor afterward so it imports the new .glb.
        </div>
      )}
      {status && <div className="status">{status}</div>}
    </div>
  );
}
