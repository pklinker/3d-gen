import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { exportGlb, downloadBlob } from "../export/gltfExport";
import { exportEffect } from "../export/spriteExport";
import { creditsLine, creditsNote } from "../export/credits";
import {
  getTarget,
  saveToGame,
  getSettings,
  updateSettings,
  CATEGORY_DIRS,
  type SaveTarget,
  type AppSettings,
} from "../export/saveToGame";

interface Props {
  def: ArtifactDef;
  seed: number;
  params: ParamValues;
  geometry: THREE.BufferGeometry | null;
  material: THREE.Material | null;
  canExportMesh: boolean;
  source: string;
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
  const [showSettings, setShowSettings] = useState(false);
  const [, setSettings] = useState<AppSettings | null>(null);
  const [gameDirInput, setGameDirInput] = useState("");
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const settingsSaved = useRef(false);

  useEffect(() => {
    getTarget().then(setTarget);
    getSettings().then((s) => {
      if (s) {
        setSettings(s);
        setGameDirInput(s.gameDir);
      }
    });
  }, []);

  const assetSubdir = CATEGORY_DIRS[def.category] ?? "assets/terrain";
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
        const res = await saveToGame(files, credits, def.category);
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

  async function handleSaveSettings() {
    if (!gameDirInput.trim()) return;
    setSettingsStatus("saving…");
    settingsSaved.current = false;
    try {
      const updated = await updateSettings({ gameDir: gameDirInput.trim() });
      setSettings(updated);
      setSettingsStatus("Saved.");
      settingsSaved.current = true;
      // Re-check reachability with the new game dir.
      const t = await getTarget();
      setTarget(t);
    } catch (e) {
      setSettingsStatus(`Failed: ${(e as Error).message}`);
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
          <code title={target.gameDir}>{assetSubdir}/</code>
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

      <div className="settings-section">
        <button
          className="settings-toggle"
          onClick={() => setShowSettings((v) => !v)}
        >
          {showSettings ? "▲" : "▼"} Settings
        </button>
        {showSettings && (
          <div className="settings-body">
            <label className="settings-label">Game directory</label>
            <div className="settings-row">
              <input
                type="text"
                className="settings-input"
                value={gameDirInput}
                onChange={(e) => {
                  setGameDirInput(e.target.value);
                  setSettingsStatus(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveSettings()}
                placeholder="/path/to/game"
                spellCheck={false}
              />
              <button onClick={handleSaveSettings}>Save</button>
            </div>
            <div className="muted small">
              Assets export into <code>{assetSubdir}/</code> inside this folder.
            </div>
            {settingsStatus && <div className="status">{settingsStatus}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
