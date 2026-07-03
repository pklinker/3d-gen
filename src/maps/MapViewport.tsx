import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Instances, Instance, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MAP_BG } from "../contract/constants";
import { LOOK_Y, camPosForTarget, IsoCamera } from "../viewport/isoCamera";
import { axialToWorld, boardBounds, cellKey, worldToAxial } from "./hexGrid";
import { buildFillGeometry, buildGridLinePositions, deployBandCells } from "./gridGeometry";
import { buildKindMesh } from "./kindMesh";
import type { KindMesh } from "./kindMesh";
import type { MapCell, TerrainKindDoc } from "./types";

interface MapViewportProps {
  cols: number;
  rows: number;
  deployZoneCols: number;
  cells: MapCell[];
  kinds: TerrainKindDoc[];
  /** Fires with the clicked hex; MapEditor decides paint vs. erase based on
   *  the current brush — this component only reports where the user clicked. */
  onCellClick: (q: number, r: number) => void;
}

/** Single-hex triangle fan, built once at module scope — the shared geometry
 *  every no-model/no-sprite kind's flat-tile fallback instances reuse. */
const FLAT_TILE_GEOMETRY = (() => {
  const { positions, indices } = buildFillGeometry([{ q: 0, r: 0 }]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
})();

function colorOf(c: [number, number, number, number]): THREE.Color {
  return new THREE.Color(c[0], c[1], c[2]);
}

/** One merged LineSegments draw call for the whole board's hex outlines,
 *  regardless of cols x rows (MAP_MODDING.md §0.12). */
function GridLines({ cols, rows }: { cols: number; rows: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(buildGridLinePositions(cols, rows), 3));
    return g;
  }, [cols, rows]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#5a4218" transparent opacity={0.6} />
    </lineSegments>
  );
}

/** One merged fill mesh tinting the west/east deploy bands — the multi-hex
 *  generalization of Viewport.tsx's single-hex HexMaskFill idiom (§6.1). */
function DeployBand({ cols, rows, deployZoneCols }: { cols: number; rows: number; deployZoneCols: number }) {
  const geometry = useMemo(() => {
    const { positions, indices } = buildFillGeometry(deployBandCells(cols, rows, deployZoneCols));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    return g;
  }, [cols, rows, deployZoneCols]);
  return (
    <mesh geometry={geometry} position={[0, 0.0006, 0]}>
      <meshBasicMaterial color="#3a6a8a" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Invisible-in-spirit ground plane (painted MAP_BG, matching Viewport.tsx's
 *  single-artifact Ground) that turns a click into a hex via worldToAxial. */
function GroundPlane({
  cols,
  rows,
  onCellClick,
}: {
  cols: number;
  rows: number;
  onCellClick: (q: number, r: number) => void;
}) {
  const box = useMemo(() => boardBounds(cols, rows), [cols, rows]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[box.cx, -0.002, box.cz]}
      onClick={(e) => {
        e.stopPropagation();
        const { q, r } = worldToAxial(e.point.x, e.point.z);
        if (q >= 0 && q < cols && r >= 0 && r < rows) onCellClick(q, r);
      }}
    >
      <planeGeometry args={[box.width, box.depth]} />
      <meshStandardMaterial color={MAP_BG} roughness={1} metalness={0} />
    </mesh>
  );
}

/** Painted terrain: one drei <Instances> block per model-backed kind (its
 *  real generated mesh, reused across every cell of that kind — geometry
 *  built once, not per cell) plus a single shared block for every kind with
 *  no bound generator or an effect-only one (a flat colored tile, mirroring
 *  the game's own "no model -> procedural fallback"). O(distinct kinds) draw
 *  calls, never O(painted cells) — MAP_MODDING.md §0.12.
 *
 *  `limit` is sized to cols*rows (the true max possible cells of any one kind
 *  on this board) rather than the current painted count: drei's Instances
 *  allocates its instance buffers ONCE at mount from `limit` and never
 *  resizes them, so a limit tied to "how many are painted right now" would
 *  silently stop rendering the moment the user paints past that count. */
function PaintedCells({ cols, rows, cells, kinds }: { cols: number; rows: number; cells: MapCell[]; kinds: TerrainKindDoc[] }) {
  const kindById = useMemo(() => new Map(kinds.map((k) => [k.id, k])), [kinds]);
  const meshByKind = useMemo(() => {
    const m = new Map<string, KindMesh | null>();
    for (const k of kinds) m.set(k.id, buildKindMesh(k));
    return m;
  }, [kinds]);

  const { meshGroups, flatCells } = useMemo(() => {
    const byKind = new Map<string, MapCell[]>();
    for (const c of cells) {
      if (!byKind.has(c.kind)) byKind.set(c.kind, []);
      byKind.get(c.kind)!.push(c);
    }
    const groups: { kindId: string; mesh: KindMesh; cells: MapCell[] }[] = [];
    const flat: (MapCell & { color: THREE.Color })[] = [];
    for (const [kindId, kindCells] of byKind) {
      const mesh = meshByKind.get(kindId);
      if (mesh) {
        groups.push({ kindId, mesh, cells: kindCells });
      } else {
        const color = colorOf(kindById.get(kindId)?.color ?? [0.5, 0.5, 0.5, 1]);
        for (const c of kindCells) flat.push({ ...c, color });
      }
    }
    return { meshGroups: groups, flatCells: flat };
  }, [cells, meshByKind, kindById]);

  const limit = Math.max(cols * rows, 1);

  return (
    <>
      {meshGroups.map(({ kindId, mesh, cells: kindCells }) => (
        <Instances key={kindId} geometry={mesh.geometry} material={mesh.material} limit={limit}>
          {kindCells.map((c) => {
            const { x, z } = axialToWorld(c.q, c.r);
            return <Instance key={cellKey(c.q, c.r)} position={[x, 0, z]} />;
          })}
        </Instances>
      ))}
      {flatCells.length > 0 && (
        <Instances geometry={FLAT_TILE_GEOMETRY} limit={limit}>
          <meshBasicMaterial transparent opacity={0.85} side={THREE.DoubleSide} />
          {flatCells.map((c) => {
            const { x, z } = axialToWorld(c.q, c.r);
            return <Instance key={cellKey(c.q, c.r)} position={[x, 0.001, z]} color={c.color} />;
          })}
        </Instances>
      )}
    </>
  );
}

// Orthographic zoom is pixels-per-world-unit at zoom=1 (R3F sizes the default
// frustum to the canvas's own pixel dimensions), so fitting a `span`-unit-wide
// board into roughly VIEWPORT_PX of visible canvas needs zoom = VIEWPORT_PX /
// span. VIEWPORT_PX is an estimate (this component doesn't measure its actual
// DOM size) tuned for the three-pane layout's center column — good enough to
// get the WHOLE board in view on load; the user can still scroll-zoom further.
const VIEWPORT_PX = 650;
function fitZoom(width: number, depth: number): number {
  return Math.max(4, Math.min(400, VIEWPORT_PX / Math.max(width, depth, 1)));
}

export default function MapViewport({ cols, rows, deployZoneCols, cells, kinds, onCellClick }: MapViewportProps) {
  const bounds = useMemo(() => boardBounds(cols, rows), [cols, rows]);
  const [zoom, setZoom] = useState(() => fitZoom(bounds.width, bounds.depth));
  // Re-frame (both zoom and look target) whenever the board is resized —
  // otherwise growing the board would leave the camera zoomed into a corner
  // of the new, larger field.
  useEffect(() => {
    setZoom(fitZoom(bounds.width, bounds.depth));
  }, [bounds.width, bounds.depth]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        camera={{ zoom, position: camPosForTarget(bounds.cx, LOOK_Y, bounds.cz), near: -200, far: 200 }}
        style={{ background: "#1c1a16" }}
      >
        <IsoCamera lookX={bounds.cx} lookY={LOOK_Y} lookZ={bounds.cz} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 2]} intensity={1.1} />
        <GroundPlane cols={cols} rows={rows} onCellClick={onCellClick} />
        <DeployBand cols={cols} rows={rows} deployZoneCols={deployZoneCols} />
        <GridLines cols={cols} rows={rows} />
        <PaintedCells cols={cols} rows={rows} cells={cells} kinds={kinds} />
        <OrbitControls
          makeDefault
          enablePan
          target={[bounds.cx, LOOK_Y, bounds.cz]}
          minZoom={4}
          maxZoom={400}
          onChange={(e) => e && setZoom((e.target.object as THREE.OrthographicCamera).zoom)}
        />
      </Canvas>
      <div className="viewport-hint">
        drag = orbit · right-drag = pan · scroll = zoom · click a hex = paint/erase · {Math.round(zoom)}
      </div>
    </div>
  );
}
