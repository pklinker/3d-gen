import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Viewport from "./viewport/Viewport";
import ParamPanel from "./ui/ParamPanel";
import ValidationPanel from "./ui/ValidationPanel";
import ExportPanel from "./ui/ExportPanel";
import PromptTab from "./ui/PromptTab";
import { ARTIFACTS, getArtifact } from "./artifacts/registry";
import ArtifactTree from "./ui/ArtifactTree";
import { defaultParams } from "./types";
import type { ArtifactType, GeneratedEffect, ParamValues } from "./types";
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
  // Global "Deco Ornamentation" level for the Buildings tab: 0 = brutalist/blocky,
  // 1 = full art-deco cornices, ribs and chevron banding. Merged into building params.
  const [ornament, setOrnament] = useState(0.4);
  const [snapRotation, setSnapRotation] = useState(true);
  const [fieldRotation, setFieldRotation] = useState(0);
  const [readCheck, setReadCheck] = useState(false);
  // Persistent utility: clamp footprints inside the hex cell + show the cell overlay.
  const [hexMask, setHexMask] = useState(false);
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
      // Buildings consume the global ornamentation level (and the hex-mask flag, so a
      // square-footprint asset can switch to a hex-conforming base) alongside their own params.
      const genParams =
        def.category === "buildings" ? { ...params, ornament, fitToHex: hexMask } : params;
      const res = def.generate(seed, genParams);
      rawGeo = (res as { geometry: THREE.BufferGeometry }).geometry;
    }
    const { geometry, report } = conformGeometry(rawGeo, contract, { fitToHex: hexMask });
    const material = makeContractMaterial(contract);
    const validation = validateMesh(geometry, contract);
    return { effect: null as GeneratedEffect | null, geometry, material, validation, report };
  }, [def, type, seed, params, aiGeometry, hexMask, ornament]);

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

        <ArtifactTree
          currentType={type}
          onSelectType={selectType}
        />

        {def.output === "mesh" && (
          <h2>Generation</h2>
        )}
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
            {def.category === "buildings" && (
              <div className="param-row ornament">
                <label title="0 = brutalist/blocky; 1 = full art-deco cornices, ribs and chevrons">
                  Deco Ornamentation
                </label>
                <div className="slider">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ornament}
                    onChange={(e) => setOrnament(Number(e.target.value))}
                  />
                  <span className="val">{ornament.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="seed-row">
              <label>Seed</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
              <button onClick={randomize} title="Randomize seed" aria-label="Randomize seed">🎲</button>
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

        <div className="utility">
          <label className="check">
            <input
              type="checkbox"
              checked={hexMask}
              onChange={(e) => setHexMask(e.target.checked)}
            />
            Hex Boundary Mask
          </label>
          <span className="muted small">
            Overlays the hex cell and fits the footprint within its edges so neighboring
            hexes line up.
          </span>
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
          hexMask={hexMask}
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
