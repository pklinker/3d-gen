import { useEffect, useMemo, useRef, useState } from "react";
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
import { listVariants, saveVariant, deleteVariant } from "./variants/store";
import { variantId } from "./variants/toKind";
import type { ArtifactVariant } from "./variants/types";
import MapEditor from "./maps/MapEditor";
import ErrorBoundary from "./ui/ErrorBoundary";

type Tab = "procedural" | "ai";
type Mode = "artifacts" | "maps";

export default function App() {
  const [mode, setMode] = useState<Mode>("artifacts");
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

  // Saved variants (data/variants.json via the dev server) — the named tunings
  // this editor can reopen, export as their own asset, and paint in the Maps
  // tab. `variantsPersisted` false means the dev endpoints weren't there and
  // the list is a browser-local mirror; the UI says so rather than implying
  // a file was written.
  const [variants, setVariants] = useState<ArtifactVariant[]>([]);
  const [variantsPersisted, setVariantsPersisted] = useState(true);
  const [variantName, setVariantName] = useState("");
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  useEffect(() => {
    void listVariants().then((r) => {
      setVariants(r.variants);
      setVariantsPersisted(r.persisted);
    });
  }, []);

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
    setActiveVariantId(null);
    setAiGeometry(null);
    setSource("procedural");
    if (getArtifact(t).output === "effect") setTab("procedural");
  }
  const activeVariant = variants.find((v) => v.id === activeVariantId) ?? null;
  const defaultVariantName = activeVariant?.displayName ?? `${def.label} ${seed}`;

  // A saved tuning may name an artifact type this build no longer has (renamed
  // or removed generator) — refuse it rather than crashing the registry lookup.
  function applyTuning(p: { type: ArtifactType; seed: number; params: ParamValues }) {
    if (!ARTIFACTS.some((a) => a.type === p.type)) {
      alert(`That tuning references unknown artifact type "${p.type}".`);
      return;
    }
    // Buildings carry the global ornamentation level inside their saved params
    // (it feeds generate() but lives outside per-type params here), so lift it
    // back out into its own control.
    if (typeof p.params.ornament === "number") setOrnament(p.params.ornament);
    setType(p.type);
    setParamsByType((prev) => ({ ...prev, [p.type]: p.params }));
    setSeedByType((prev) => ({ ...prev, [p.type]: p.seed }));
    setAiGeometry(null);
    setSource("procedural");
  }
  async function onLoadPreset(file: File) {
    setActiveVariantId(null);
    applyTuning(await loadPreset(file));
  }

  function applyVariant(v: ArtifactVariant) {
    applyTuning(v);
    setActiveVariantId(v.id);
  }
  async function onSaveVariant() {
    const displayName = (variantName.trim() || defaultVariantName).slice(0, 60);
    const id = variantId(displayName);
    if (!id) return;
    const entry: ArtifactVariant = {
      id,
      displayName,
      type,
      seed,
      params: def.category === "buildings" ? { ...params, ornament } : params,
      savedAt: Date.now(),
    };
    const r = await saveVariant(entry);
    setVariants(r.variants);
    setVariantsPersisted(r.persisted);
    setActiveVariantId(id);
    setVariantName("");
  }
  async function onDeleteVariant(id: string) {
    const r = await deleteVariant(id);
    setVariants(r.variants);
    setVariantsPersisted(r.persisted);
    if (activeVariantId === id) setActiveVariantId(null);
  }

  return (
    <div className="app-shell">
      <div className="mode-tabs">
        <button className={mode === "artifacts" ? "active" : ""} onClick={() => setMode("artifacts")}>
          Artifacts
        </button>
        <button className={mode === "maps" ? "active" : ""} onClick={() => setMode("maps")}>
          Maps
        </button>
      </div>
      <div className="app">
        {mode === "maps" ? (
          <ErrorBoundary>
            <MapEditor />
          </ErrorBoundary>
        ) : (
          <>
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

        <h2>Variants</h2>
        <div className="variant-save">
          <input
            type="text"
            placeholder={defaultVariantName}
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onSaveVariant()}
          />
          <button onClick={() => void onSaveVariant()} title="Save this tuning to data/variants.json">
            Save variant
          </button>
        </div>

        {variants.length > 0 ? (
          <div className="variant-list">
            {variants.map((v) => {
              const artifact = ARTIFACTS.find((a) => a.type === v.type);
              return (
                <div key={v.id} className={`variant-item${v.id === activeVariantId ? " active" : ""}`}>
                  <button
                    className="variant-load-btn"
                    title={`${artifact?.label ?? v.type} · seed ${v.seed} · paints as kind "${v.id}"`}
                    onClick={() => applyVariant(v)}
                  >
                    <span className="variant-name">{v.displayName}</span>
                    <span className="variant-type">{artifact?.label ?? v.type}</span>
                  </button>
                  <button
                    className="variant-file-btn"
                    title="Download this variant as a .json file"
                    onClick={() => savePreset(v, v.id)}
                  >
                    ↓
                  </button>
                  <button
                    className="variant-delete-btn"
                    title="Delete this variant"
                    onClick={() => void onDeleteVariant(v.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted small">
            A saved variant is a named tuning: it reopens here, exports as its own asset,
            and appears in the Maps palette.
          </span>
        )}
        {!variantsPersisted && (
          <span className="muted small">
            Dev server unreachable — variants are stored in this browser only, not in
            data/variants.json.
          </span>
        )}

        <div className="presets">
          <button onClick={() => savePreset({ type, seed, params }, activeVariant?.id ?? def.fileStem)}>
            Export file
          </button>
          <button onClick={() => fileInput.current?.click()}>Import file</button>
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
          fileStem={activeVariant?.id}
        />
      </aside>
          </>
        )}
      </div>
    </div>
  );
}
