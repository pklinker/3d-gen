import { useEffect, useRef, useState } from "react";
import MapViewport from "./MapViewport";
import KindForm from "./KindForm";
import { useCatalogData } from "./useCatalogData";
import { applyPaint, eraseCell, setCell } from "./paint";
import { cellKey } from "./hexGrid";
import { groupPalette } from "./paletteGroups";
import { kindDocToEntry, mapDocToEntry } from "./serialize";
import { saveMapToGame, saveTerrainKindToGame } from "../export/saveMap";
import type { MapDoc, TerrainKindDoc } from "./types";
import type { ArtifactCategory } from "../types";

const BLANK_MAP: MapDoc = {
  id: "",
  displayName: "",
  cols: 20,
  rows: 20,
  deployZoneCols: 8,
  deployMinSeparation: 4,
  cells: [],
};

export default function MapEditor() {
  const catalog = useCatalogData();
  const [kinds, setKinds] = useState<TerrainKindDoc[]>(catalog.kinds);
  const [seededFromCatalog, setSeededFromCatalog] = useState(false);
  // Seed the local (editable) palette from the catalog exactly once, when the
  // initial fetch resolves — after that the palette is this session's own
  // state (a kind added via KindForm shouldn't vanish if the catalog refetches).
  useEffect(() => {
    if (!catalog.loading && !seededFromCatalog) {
      setKinds(catalog.kinds);
      setSeededFromCatalog(true);
    }
  }, [catalog.loading, catalog.kinds, seededFromCatalog]);

  const [doc, setDoc] = useState<MapDoc>(BLANK_MAP);
  const [selectedMapId, setSelectedMapId] = useState("");
  const [brush, setBrush] = useState<string | null>(kinds[0]?.id ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [mapStatus, setMapStatus] = useState<string | null>(null);
  const [kindStatus, setKindStatus] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<ArtifactCategory>>(new Set());

  function toggleSection(category: ArtifactCategory) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function loadMap(id: string) {
    setSelectedMapId(id);
    if (id === "") {
      setDoc(BLANK_MAP);
      return;
    }
    const found = catalog.maps.find((m) => m.id === id);
    if (found) setDoc(found);
  }

  function updateDoc<K extends keyof MapDoc>(key: K, value: MapDoc[K]) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  // Brush-drag painting: pointer-down decides the stroke's mode (paint vs.
  // erase) exactly like a single click's toggle would (applyPaint), then
  // every subsequent hex the drag enters gets force-set/erased with that same
  // decision — re-toggling per cell would make a drag flicker cells on/off as
  // it crosses itself instead of painting/erasing a clean swath.
  const strokeRef = useRef<{ mode: "paint" | "erase"; lastKey: string } | null>(null);

  function onPaintDown(q: number, r: number) {
    setDoc((prev) => {
      const cells = applyPaint(prev.cells, q, r, brush);
      const painted = brush !== null && cells.some((c) => c.q === q && c.r === r && c.kind === brush);
      strokeRef.current = { mode: painted ? "paint" : "erase", lastKey: cellKey(q, r) };
      return { ...prev, cells };
    });
  }

  function onPaintMove(q: number, r: number) {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const key = cellKey(q, r);
    if (key === stroke.lastKey) return;
    stroke.lastKey = key;
    setDoc((prev) => ({
      ...prev,
      cells: stroke.mode === "erase" ? eraseCell(prev.cells, q, r) : setCell(prev.cells, q, r, brush as string),
    }));
  }

  function onPaintUp() {
    strokeRef.current = null;
  }

  async function exportMap() {
    if (!doc.id.trim()) {
      setMapStatus("Set a map id before exporting.");
      return;
    }
    setMapStatus("exporting…");
    try {
      const res = await saveMapToGame(mapDocToEntry(doc));
      setMapStatus(`Wrote ${doc.id} → ${res.file} (${res.count} maps total)`);
      catalog.refresh();
    } catch (e) {
      setMapStatus(`Export failed: ${(e as Error).message}`);
    }
  }

  async function exportKind(kind: TerrainKindDoc) {
    setKindStatus(`exporting ${kind.id}…`);
    try {
      const res = await saveTerrainKindToGame(kindDocToEntry(kind));
      setKindStatus(`Wrote ${kind.id} → ${res.file} (${res.count} kinds total)`);
      catalog.refresh();
    } catch (e) {
      setKindStatus(`Export failed: ${(e as Error).message}`);
    }
  }

  function addKind(kind: TerrainKindDoc) {
    setKinds((prev) => [...prev.filter((k) => k.id !== kind.id), kind]);
    setBrush(kind.id);
    setFormOpen(false);
  }

  return (
    <>
      <aside className="panel left">
        <h1>Map Editor</h1>

        <div className="param-row">
          <label>Load existing map</label>
          <select value={selectedMapId} onChange={(e) => loadMap(e.target.value)}>
            <option value="">New Map</option>
            {catalog.maps.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
            ))}
          </select>
        </div>

        <h2>Board</h2>
        <div className="param-row">
          <label>Id (maps.json entry id)</label>
          <input value={doc.id} onChange={(e) => updateDoc("id", e.target.value)} placeholder="crystal_flats" />
        </div>
        <div className="param-row">
          <label>Display name</label>
          <input value={doc.displayName} onChange={(e) => updateDoc("displayName", e.target.value)} placeholder="Crystal Flats" />
        </div>
        <div className="param-row">
          <label>Columns</label>
          <input type="number" min={1} max={96} value={doc.cols} onChange={(e) => updateDoc("cols", Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="param-row">
          <label>Rows</label>
          <input type="number" min={1} max={96} value={doc.rows} onChange={(e) => updateDoc("rows", Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="param-row">
          <label>Deploy zone columns (per-side band width)</label>
          <input
            type="number"
            min={0}
            max={doc.cols}
            value={doc.deployZoneCols}
            onChange={(e) => updateDoc("deployZoneCols", Number(e.target.value))}
          />
        </div>
        <div className="param-row">
          <label>Deploy min separation (hexes)</label>
          <input
            type="number"
            min={0}
            value={doc.deployMinSeparation}
            onChange={(e) => updateDoc("deployMinSeparation", Number(e.target.value))}
          />
        </div>

        <div className="presets">
          <button onClick={exportMap}>Export Map</button>
        </div>
        {mapStatus && <div className="status">{mapStatus}</div>}
      </aside>

      <main className="viewport-wrap">
        <MapViewport
          cols={doc.cols}
          rows={doc.rows}
          deployZoneCols={doc.deployZoneCols}
          cells={doc.cells}
          kinds={kinds}
          onPaintDown={onPaintDown}
          onPaintMove={onPaintMove}
          onPaintUp={onPaintUp}
        />
      </main>

      <aside className="panel right">
        <h2>Palette</h2>
        <div className="palette-list">
          <button
            className={`palette-item${brush === null ? " active" : ""}`}
            onClick={() => setBrush(null)}
          >
            Eraser
          </button>
          {groupPalette(kinds).map((section) => {
            const isOpen = !collapsedSections.has(section.category);
            return (
              <div key={section.category} className="palette-section">
                <button
                  className={`palette-section-header${isOpen ? " open" : ""}`}
                  onClick={() => toggleSection(section.category)}
                  aria-expanded={isOpen}
                >
                  <span className="tree-chevron">▶</span>
                  {section.label}
                </button>
                {isOpen &&
                  section.kinds.map((k) => (
                    <div key={k.id} className={`palette-item${brush === k.id ? " active" : ""}`}>
                      <button className="palette-swatch-btn" onClick={() => setBrush(k.id)}>
                        <span
                          className="palette-swatch"
                          style={{ background: `rgba(${Math.round(k.color[0] * 255)}, ${Math.round(k.color[1] * 255)}, ${Math.round(k.color[2] * 255)}, ${k.color[3]})` }}
                        />
                        {k.displayName}
                      </button>
                      <button className="palette-export-btn" title="Export this kind to the game" onClick={() => exportKind(k)}>
                        ↑
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        {kindStatus && <div className="status">{kindStatus}</div>}

        {formOpen ? (
          <KindForm onSave={addKind} onCancel={() => setFormOpen(false)} />
        ) : (
          <div className="presets">
            <button onClick={() => setFormOpen(true)}>+ New Kind</button>
          </div>
        )}
      </aside>
    </>
  );
}
