import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Viewport from "./viewport/Viewport";
import ParamPanel from "./ui/ParamPanel";
import ValidationPanel from "./ui/ValidationPanel";
import ExportPanel from "./ui/ExportPanel";
import PromptTab from "./ui/PromptTab";
import { ARTIFACTS, CATEGORIES, artifactsInCategory, getArtifact } from "./artifacts/registry";
import { defaultParams } from "./types";
import type { ArtifactCategory, ArtifactType, GeneratedEffect, ParamValues } from "./types";
import { conformGeometry, makeContractMaterial } from "./generation/conform";
import type { ConformReport } from "./generation/conform";
import { validateMesh } from "./contract/validate";
import type { ValidationResult } from "./contract/validate";
import { savePreset, loadPreset } from "./export/presets";

type Tab = "procedural" | "ai";

export default function App() {
  const [type, setType] = useState<ArtifactType>("hill");
  const def = getArtifact(type);

  // Per-type param + seed state so switching types keeps each tuning.
  const [paramsByType, setParamsByType] = useState<Record<string, ParamValues>>(() => {
    const init: Record<string, ParamValues> = {};
    for (const a of ARTIFACTS) init[a.type] = defaultParams(a.params);
    return init;
  });
  const [seedByType, setSeedByType] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const a of ARTIFACTS) init[a.type] = 1;
    return init;
  });
  const params = paramsByType[type];
  const seed = seedByType[type];

  const [tab, setTab] = useState<Tab>("procedural");
  const [snapRotation, setSnapRotation] = useState(true);
  const [fieldRotation, setFieldRotation] = useState(0);
  const [readCheck, setReadCheck] = useState(false);
  const [source, setSource] = useState("procedural");
  const fileInput = useRef<HTMLInputElement>(null);

  // AI-imported geometry overrides procedural for the current render, until params change.
  const [aiGeometry, setAiGeometry] = useState<THREE.BufferGeometry | null>(null);

  // Derive the displayed mesh/effect from current state.
  const derived = useMemo(() => {
    if (def.output === "effect") {
      const res = def.generate(seed, params);
      return { effect: res as GeneratedEffect, geometry: null, material: null, validation: null, report: null };
    }
    const contract = def.contract ?? "hill";
    let rawGeo: THREE.BufferGeometry;
    if (aiGeometry) {
      rawGeo = aiGeometry;
    } else {
      const res = def.generate(seed, params);
      rawGeo = (res as { geometry: THREE.BufferGeometry }).geometry;
    }
    const { geometry, report } = conformGeometry(rawGeo, contract);
    const material = makeContractMaterial(contract);
    const validation = validateMesh(geometry, contract);
    return { effect: null as GeneratedEffect | null, geometry, material, validation, report };
  }, [def, type, seed, params, aiGeometry]);

  function setParam(key: string, value: number | boolean | string) {
    setAiGeometry(null); // editing params returns to procedural
    setSource("procedural");
    setParamsByType((prev) => ({ ...prev, [type]: { ...prev[type], [key]: value } }));
  }
  function setSeed(v: number) {
    setAiGeometry(null);
    setSource("procedural");
    setSeedByType((prev) => ({ ...prev, [type]: v }));
  }
  function randomize() {
    setSeed(Math.floor(Math.random() * 1e9));
  }

  // Switch the selected artifact, resetting AI overrides and the procedural/AI subtab.
  function selectType(t: ArtifactType) {
    setType(t);
    setAiGeometry(null);
    setSource("procedural");
    if (getArtifact(t).output === "effect") setTab("procedural");
  }
  // Picking a category selects its first artifact (no-op if already inside it).
  function selectCategory(cat: ArtifactCategory) {
    if (cat === def.category) return;
    const first = artifactsInCategory(cat)[0];
    if (first) selectType(first.type);
  }

  async function onLoadPreset(file: File) {
    const p = await loadPreset(file);
    setType(p.type);
    setParamsByType((prev) => ({ ...prev, [p.type]: p.params }));
    setSeedByType((prev) => ({ ...prev, [p.type]: p.seed }));
    setAiGeometry(null);
    setSource("procedural");
  }

  return (
    <div className="app">
      {/* LEFT: generation controls */}
      <aside className="panel left">
        <h1>Terrain Artifact Editor</h1>

        <div className="category-tabs">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={c.id === def.category ? "active" : ""}
              onClick={() => selectCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="type-tabs">
          {artifactsInCategory(def.category).map((a) => (
            <button
              key={a.type}
              className={a.type === type ? "active" : ""}
              onClick={() => selectType(a.type)}
            >
              {a.label}
            </button>
          ))}
        </div>

        {def.output === "mesh" && (
          <div className="subtabs">
            <button className={tab === "procedural" ? "active" : ""} onClick={() => setTab("procedural")}>
              Procedural
            </button>
            <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>
              AI
            </button>
          </div>
        )}

        {tab === "procedural" || def.output === "effect" ? (
          <>
            <ParamPanel specs={def.params} values={params} onChange={setParam} />
            <div className="seed-row">
              <label>Seed</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
              <button onClick={randomize}>🎲</button>
            </div>
          </>
        ) : (
          <PromptTab
            promptSeed={def.promptSeed ?? ""}
            onResult={(geo, src) => {
              setAiGeometry(geo);
              setSource(src);
            }}
          />
        )}

        <div className="presets">
          <button
            onClick={() => savePreset({ type, seed, params }, `${def.fileStem}_${seed}`)}
          >
            Save preset
          </button>
          <button onClick={() => fileInput.current?.click()}>Load preset</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onLoadPreset(e.target.files[0])}
          />
        </div>
      </aside>

      {/* CENTER: viewport */}
      <main className="viewport-wrap">
        <Viewport
          meshGeometry={derived.geometry}
          meshMaterial={derived.material}
          effect={derived.effect}
          fieldRotationDeg={fieldRotation}
          snapRotation={snapRotation}
          readCheck={readCheck}
        />
        <div className="viewport-controls">
          <label>
            Field rotation
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={fieldRotation}
              onChange={(e) => setFieldRotation(Number(e.target.value))}
            />
            <span>{fieldRotation}°</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={snapRotation} onChange={(e) => setSnapRotation(e.target.checked)} />
            Snap 15°
          </label>
          <label className="check">
            <input type="checkbox" checked={readCheck} onChange={(e) => setReadCheck(e.target.checked)} />
            Read check
          </label>
        </div>
      </main>

      {/* RIGHT: validation + export */}
      <aside className="panel right">
        <h2>Contract</h2>
        {def.output === "mesh" ? (
          <ValidationPanel result={derived.validation as ValidationResult} report={derived.report as ConformReport} />
        ) : (
          <div className="muted small">
            Effects export as a sprite sheet + JSON; no mesh contract applies.
          </div>
        )}

        <h2>Export</h2>
        <ExportPanel
          def={def}
          seed={seed}
          params={params}
          geometry={derived.geometry}
          material={derived.material}
          canExportMesh={!!derived.validation?.allPass}
          source={source}
          effect={derived.effect}
        />
      </aside>
    </div>
  );
}
