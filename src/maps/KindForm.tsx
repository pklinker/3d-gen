import { useMemo, useState } from "react";
import { artifactsInCategory } from "../artifacts/registry";
import { deriveKindDocFromArtifact } from "./autoKind";
import { hexToRgba, rgbaToHex } from "./color";
import type { ArtifactType } from "../types";
import type { TerrainKindDoc } from "./types";

interface KindFormProps {
  onSave: (kind: TerrainKindDoc) => void;
  onCancel: () => void;
}

/** "Pick a generator (existing artifact)" (§6.1a) — a mesh generator previews
 *  as the real 3D model in the painter; an effect generator previews as the
 *  procedural flat-tile fallback here (the game plays it as an animated
 *  sprite, which this editor doesn't simulate — see MAP_MODDING.md T8 scope
 *  notes) but still needs sprite tuning to point at wherever its sheet is
 *  exported from the existing Effects tab. */
const MESH_OPTIONS = [...artifactsInCategory("terrain"), ...artifactsInCategory("buildings")];
const SPRITE_OPTIONS = artifactsInCategory("effects");

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function KindForm({ onSave, onCancel }: KindFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [idOverride, setIdOverride] = useState("");
  const [category, setCategory] = useState<"terrain" | "building">("terrain");
  const [blocksLos, setBlocksLos] = useState(false);
  const [spotPenalty, setSpotPenalty] = useState(0);
  const [color, setColor] = useState("#7a6a4a");
  const [height, setHeight] = useState(0.5);
  const [footprint, setFootprint] = useState(1.0);
  // "" = no generator (a passive, non-blocking decoration — §6.1a default).
  const [generator, setGenerator] = useState<ArtifactType | "">("");

  // Bake-camera framing for a model kind — heuristic defaults from the picked
  // generator's own contract, then WYSIWYG-editable (§0.13): paint the kind
  // onto the grid and tune these against the real mesh at real scale.
  const [frame, setFrame] = useState(2.0);
  const [span, setSpan] = useState(2.0);
  const [lookY, setLookY] = useState(0.3);
  const [anchor, setAnchor] = useState(0.55);

  const [spritePrefix, setSpritePrefix] = useState("");
  const [spriteSpan, setSpriteSpan] = useState(1.8);
  const [spriteAnchor, setSpriteAnchor] = useState(0.62);

  const id = idTouched ? idOverride : slugify(displayName);
  const meshDef = useMemo(
    () => MESH_OPTIONS.find((a) => a.type === generator),
    [generator],
  );
  const spriteDef = useMemo(
    () => SPRITE_OPTIONS.find((a) => a.type === generator),
    [generator],
  );

  // Reuses autoKind's derivation (the same heuristic the full-registry
  // palette is built from, MAP_MODDING.md §0.13) so picking a generator here
  // seeds every field — including the artifact's own color — with the exact
  // starting point a modder would get from the auto-populated palette; the
  // fields stay individually editable from there for WYSIWYG tuning.
  function pickGenerator(type: ArtifactType | "") {
    setGenerator(type);
    if (!type) return;
    const doc = deriveKindDocFromArtifact(type);
    setColor(rgbaToHex(doc.color));
    setHeight(doc.height);
    if (doc.footprint !== undefined) setFootprint(doc.footprint);
    if (doc.model) {
      setFrame(doc.model.frame);
      setSpan(doc.model.span);
      setLookY(doc.model.lookY);
      setAnchor(doc.model.anchor);
    } else if (doc.sprite) {
      setSpritePrefix(doc.sprite.prefix);
      setSpriteSpan(doc.sprite.span);
      setSpriteAnchor(doc.sprite.anchor);
    }
  }

  const canSave = id.length > 0 && displayName.trim().length > 0;

  function save() {
    if (!canSave) return;
    const doc: TerrainKindDoc = {
      id,
      displayName: displayName.trim(),
      category,
      blocksLos,
      spotPenalty,
      color: hexToRgba(color),
      height,
      footprint,
    };
    if (meshDef) {
      doc.generatorType = meshDef.type;
      doc.model = {
        dir: category === "building" ? "buildings" : "terrain",
        prefix: meshDef.fileStem,
        frame,
        span,
        lookY,
        anchor,
      };
    } else if (spriteDef) {
      doc.generatorType = spriteDef.type;
      doc.sprite = { prefix: spritePrefix || spriteDef.fileStem, span: spriteSpan, anchor: spriteAnchor, dir: "terrain" };
    }
    onSave(doc);
  }

  return (
    <div className="kind-form">
      <h2>New Terrain Kind</h2>

      <div className="param-row">
        <label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Crystal Spire" />
      </div>
      <div className="param-row">
        <label>Id (kind id used in maps.json / terrain.json)</label>
        <input
          value={id}
          onChange={(e) => {
            setIdTouched(true);
            setIdOverride(slugify(e.target.value));
          }}
          placeholder="crystal_spire"
        />
      </div>
      <div className="param-row">
        <label>Category (asset grouping only)</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as "terrain" | "building")}>
          <option value="terrain">Terrain</option>
          <option value="building">Building</option>
        </select>
      </div>

      <h2>Rules</h2>
      <label className="check">
        <input type="checkbox" checked={blocksLos} onChange={(e) => setBlocksLos(e.target.checked)} />
        Blocks line of sight
      </label>
      <div className="param-row">
        <label>Spotting penalty (to-hit per hex along a shot's path)</label>
        <input type="number" min={0} value={spotPenalty} onChange={(e) => setSpotPenalty(Number(e.target.value))} />
      </div>

      <h2>Appearance</h2>
      <div className="param-row">
        <label>Fill color (map marker / procedural fallback)</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="param-row">
        <label>Massing height (iso extrusion)</label>
        <input type="number" step={0.05} min={0} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
      </div>
      <div className="param-row">
        <label>Footprint radius (prism fallback, hex units)</label>
        <input type="number" step={0.05} min={0.1} max={1} value={footprint} onChange={(e) => setFootprint(Number(e.target.value))} />
      </div>

      <h2>Generator</h2>
      <div className="param-row">
        <label>Preview mesh / effect (existing artifact — leave as None for a passive decoration)</label>
        <select value={generator} onChange={(e) => pickGenerator(e.target.value as ArtifactType | "")}>
          <option value="">None (decoration only)</option>
          <optgroup label="Mesh">
            {MESH_OPTIONS.map((a) => (
              <option key={a.type} value={a.type}>{a.label}</option>
            ))}
          </optgroup>
          <optgroup label="Sprite (effects)">
            {SPRITE_OPTIONS.map((a) => (
              <option key={a.type} value={a.type}>{a.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {meshDef && (
        <div className="settings-section">
          <div className="settings-body">
            <span className="muted small">
              Bake-camera framing. Paint this kind onto the grid to see it live, then tune.
            </span>
            <div className="param-row">
              <label>Frame (camera world-units to fit the model)</label>
              <input type="number" step={0.05} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
            </div>
            <div className="param-row">
              <label>Span (on-screen size, hex-units)</label>
              <input type="number" step={0.05} value={span} onChange={(e) => setSpan(Number(e.target.value))} />
            </div>
            <div className="param-row">
              <label>Look Y (camera aim height)</label>
              <input type="number" step={0.05} value={lookY} onChange={(e) => setLookY(Number(e.target.value))} />
            </div>
            <div className="param-row">
              <label>Anchor (fraction down the sprite where the hex centre sits)</label>
              <input type="number" step={0.01} min={0} max={1} value={anchor} onChange={(e) => setAnchor(Number(e.target.value))} />
            </div>
          </div>
        </div>
      )}

      {spriteDef && (
        <div className="settings-section">
          <div className="settings-body">
            <span className="muted small">
              Points at the sheet exported from the Effects tab ({spriteDef.label}) — export it there first with
              this prefix.
            </span>
            <div className="param-row">
              <label>Sheet filename prefix</label>
              <input value={spritePrefix} onChange={(e) => setSpritePrefix(e.target.value)} />
            </div>
            <div className="param-row">
              <label>Span (on-screen size, hex-units)</label>
              <input type="number" step={0.05} value={spriteSpan} onChange={(e) => setSpriteSpan(Number(e.target.value))} />
            </div>
            <div className="param-row">
              <label>Anchor</label>
              <input type="number" step={0.01} min={0} max={1} value={spriteAnchor} onChange={(e) => setSpriteAnchor(Number(e.target.value))} />
            </div>
          </div>
        </div>
      )}

      <div className="presets">
        <button onClick={save} disabled={!canSave}>Add to palette</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
