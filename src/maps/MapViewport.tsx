import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Instances, Instance, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MAP_BG } from "../contract/constants";
import { LOOK_Y, camPosForTarget, IsoCamera } from "../viewport/isoCamera";
import { BakeLighting } from "../viewport/bakeLighting";
import { axialToWorld, boardBounds, cellKey } from "./hexGrid";
import { hexAtPointer, ndcOf } from "./picking";
import { buildFillGeometry, buildGridLinePositions, deployBandCells } from "./gridGeometry";
import { buildKindMesh } from "./kindMesh";
import { PAN_KEYS, arrowPanStep, boardClampOffset, clampPanStep } from "./panKeys";
import type { BoardBounds } from "./hexGrid";
import type { KindMesh } from "./kindMesh";
import type { MapCell, TerrainKindDoc } from "./types";

interface MapViewportProps {
  cols: number;
  rows: number;
  deployZoneCols: number;
  cells: MapCell[];
  kinds: TerrainKindDoc[];
  /** Left-button-down on a hex — starts a paint/erase stroke (MapEditor
   *  decides which, from the current brush). */
  onPaintDown: (q: number, r: number) => void;
  /** Fires as the left-button-held drag enters each new hex, continuing the
   *  stroke started by onPaintDown. */
  onPaintMove: (q: number, r: number) => void;
  /** Left button released — ends the stroke. */
  onPaintUp: () => void;
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

/** Ground plane (painted MAP_BG, matching Viewport.tsx's single-artifact
 *  Ground) — purely visual background; PaintPlane owns hex click/drag input. */
function GroundPlane({ cols, rows }: { cols: number; rows: number }) {
  const box = useMemo(() => boardBounds(cols, rows), [cols, rows]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[box.cx, -0.002, box.cz]}>
      <planeGeometry args={[box.width, box.depth]} />
      <meshStandardMaterial color={MAP_BG} roughness={1} metalness={0} />
    </mesh>
  );
}

/** Owns all hex paint input: pointer-down starts a stroke, pointer-move
 *  (while the left button is held) continues it, pointer-up ends it.
 *  Alt-drags are ignored — that's the orbit gesture (§ MapViewport's
 *  <OrbitControls mouseButtons>).
 *
 *  Listens on the canvas and intersects the ground analytically (picking.ts)
 *  rather than raycasting an invisible pick mesh. The mesh version silently
 *  lost the bottom ~6 rows of the board: with this rig's negative ortho
 *  `near`, three.js starts the pick ray at the plane through the camera,
 *  which sinks below the mesh's own height partway down the screen — putting
 *  the mesh BEHIND the ray origin, where `raycaster.near = 0` discards it.
 *  No mesh, no near plane, no dead band, and no parallax to correct for. */
function PaintInput({
  cols,
  rows,
  onPaintDown,
  onPaintMove,
  onPaintUp,
}: {
  cols: number;
  rows: number;
  onPaintDown: (q: number, r: number) => void;
  onPaintMove: (q: number, r: number) => void;
  onPaintUp: () => void;
}) {
  const { camera, gl } = useThree();
  // MapEditor rebuilds these handlers on every render; holding them in a ref
  // keeps the listeners attached once per camera/board instead of churning.
  const cb = useRef({ onPaintDown, onPaintMove, onPaintUp });
  cb.current = { onPaintDown, onPaintMove, onPaintUp };

  useEffect(() => {
    const el = gl.domElement;

    function hexAt(e: PointerEvent): { q: number; r: number } | null {
      const [x, y] = ndcOf(e.clientX, e.clientY, el.getBoundingClientRect());
      const hex = hexAtPointer(camera, x, y);
      if (!hex || hex.q < 0 || hex.q >= cols || hex.r < 0 || hex.r >= rows) return null;
      return hex;
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || e.altKey) return; // alt-drag = orbit, not paint
      const hex = hexAt(e);
      if (hex) cb.current.onPaintDown(hex.q, hex.r);
    };
    const move = (e: PointerEvent) => {
      if ((e.buttons & 1) === 0 || e.altKey) return; // left button not held, or orbiting
      const hex = hexAt(e);
      if (hex) cb.current.onPaintMove(hex.q, hex.r);
    };
    // Up listens on the window so a stroke released off the canvas still ends.
    const up = (e: PointerEvent) => {
      if (e.button === 0) cb.current.onPaintUp();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, gl, cols, rows]);

  return null;
}

/** Arrow keys pan the board: it drags the camera AND the orbit target by the
 *  same ground-plane offset, which slides the view without touching the iso
 *  angle or the zoom (right-drag pan does the same thing through OrbitControls).
 *
 *  Held keys are accumulated and applied per frame rather than per keydown, so
 *  holding an arrow glides at a steady rate instead of stuttering on the OS's
 *  key-repeat delay. The travel is bounded by the board itself (clampPanStep) —
 *  holding an arrow coasts to a stop at the edge instead of leaving the user
 *  staring at empty ground with no way back but a board resize.
 *
 *  Moving the target imperatively survives re-renders: MapViewport passes
 *  OrbitControls a `target` array that only changes when the board is resized,
 *  and R3F compares array props element-wise — so an unrelated re-render (a
 *  paint stroke, a zoom) won't snap the pan back to the board's centroid. */
function ArrowKeyPan({ bounds }: { bounds: BoardBounds }) {
  const { camera, controls } = useThree();
  const held = useRef(new Set<string>());
  const step = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    // The left panel's number inputs (cols/rows/deploy) use arrows to step their
    // value — panning the board out from under a typing user would be worse than
    // useless, so keystrokes aimed at a field are left alone.
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

    const down = (e: KeyboardEvent) => {
      if (!PAN_KEYS.has(e.key) || isTyping(e.target)) return;
      e.preventDefault(); // arrows would otherwise scroll the editor's panes
      held.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.key);
    // A key released while the window is unfocused never fires keyup here, which
    // would leave the board gliding forever — drop everything on focus loss.
    const clear = () => held.current.clear();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, dt) => {
    if (held.current.size === 0 || !controls) return;
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void };
    arrowPanStep(held.current, camera.quaternion, (camera as THREE.OrthographicCamera).zoom, dt, step);
    clampPanStep(step, orbit.target.x, orbit.target.z, bounds);
    if (step.lengthSq() === 0) return; // already against the board's edge
    // Moving the camera and the orbit target by the same offset slides the view
    // without changing the angle or the distance OrbitControls maintains.
    camera.position.add(step);
    orbit.target.add(step);
    orbit.update();
  });

  return null;
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

export default function MapViewport({
  cols,
  rows,
  deployZoneCols,
  cells,
  kinds,
  onPaintDown,
  onPaintMove,
  onPaintUp,
}: MapViewportProps) {
  const bounds = useMemo(() => boardBounds(cols, rows), [cols, rows]);
  const [zoom, setZoom] = useState(() => fitZoom(bounds.width, bounds.depth));
  // Re-frame (both zoom and look target) whenever the board is resized —
  // otherwise growing the board would leave the camera zoomed into a corner
  // of the new, larger field.
  useEffect(() => {
    setZoom(fitZoom(bounds.width, bounds.depth));
  }, [bounds.width, bounds.depth]);

  // Right-drag pan runs inside OrbitControls, so there's no step of ours to trim
  // the way the arrow keys are trimmed — the move has already landed by the time
  // the controls report it. Correcting it on every change is equivalent: the
  // target is hauled back to the board's edge within the same tick, before the
  // frame is drawn, so a drag simply stops there and resumes on the way back.
  const clampFix = useRef(new THREE.Vector3()).current;
  function onControlsChange(e?: { target?: unknown }) {
    const orbit = e?.target as { target: THREE.Vector3; object: THREE.OrthographicCamera } | undefined;
    if (!orbit) return;
    const fix = boardClampOffset(orbit.target, bounds, clampFix);
    if (fix.lengthSq() > 0) {
      // Camera moves with the target, so the correction is a pure slide — the
      // controls' own spherical state (angle, distance) is left untouched, and
      // nothing here calls update(), so this can't re-enter through its change event.
      orbit.target.add(fix);
      orbit.object.position.add(fix);
    }
    setZoom(orbit.object.zoom);
  }

  // Alt(⌥)+left-drag orbits; plain left-drag paints. The left button can't be
  // BOTH paint and orbit, and orbit can't live only on the middle button — a
  // Mac trackpad/Magic Mouse has no middle button, which would make the iso
  // tilt unreachable entirely. So the Alt state hands LEFT to OrbitControls
  // for the duration (PaintPlane ignores alt-drags on its side).
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    const clear = () => setAltHeld(false); // release on focus loss (⌘-tab away mid-hold)
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Renders continuously (R3F's default frameloop), like Viewport.tsx.
          This canvas used to run `frameloop="demand"` with a helper that called
          invalidate() on every content change — but on-demand made the board's
          visibility depend on a handful of one-shot animation frames actually
          being delivered at mount. R3F drives every canvas from ONE shared rAF
          loop guarded by a global "is the loop running" flag, and that loop is
          being torn down by the Artifacts canvas at the exact moment this one
          mounts (switching tabs unmounts it). If the requested frames are
          dropped or deferred — a backgrounded/occluded tab throttles rAF, and
          the teardown race can swallow them outright — this scene is static:
          no useFrame, no animation, so nothing ever asks for another frame and
          the viewport stays empty until an unrelated camera change restarts the
          loop. Rendering every frame costs ~6 draw calls and removes the whole
          failure mode. */}
      <Canvas
        orthographic
        camera={{ zoom, position: camPosForTarget(bounds.cx, LOOK_Y, bounds.cz), near: -200, far: 200 }}
        style={{ background: "#1c1a16" }}
      >
        <IsoCamera lookX={bounds.cx} lookY={LOOK_Y} lookZ={bounds.cz} />
        {/* Same rig as the Artifacts viewport and the game's bake — see bakeLighting.tsx.
            It replaces a flat ambient plus a key light on a mirrored direction, which lit
            painted terrain differently from both the single-artifact preview and the sprite
            the game actually bakes. */}
        <BakeLighting />
        <GroundPlane cols={cols} rows={rows} />
        <DeployBand cols={cols} rows={rows} deployZoneCols={deployZoneCols} />
        <GridLines cols={cols} rows={rows} />
        <PaintedCells cols={cols} rows={rows} cells={cells} kinds={kinds} />
        <PaintInput cols={cols} rows={rows} onPaintDown={onPaintDown} onPaintMove={onPaintMove} onPaintUp={onPaintUp} />
        {/* Drives the same camera/target pair as OrbitControls below, which
            publishes itself to state.controls via makeDefault. */}
        <ArrowKeyPan bounds={bounds} />
        <OrbitControls
          makeDefault
          enablePan
          // Pan along the BOARD, not the screen. Three's default screen-space
          // panning slides the target along the camera's up axis, which on a
          // 35°-tilted rig is mostly world Y — so a vertical right-drag lifted
          // the look point off the ground entirely and sailed the board out of
          // frame in a direction no ground-plane bound can catch. False makes
          // the vertical drag axis `up x right`, the same ground-plane vector
          // arrowPanStep uses, which keeps the target on the board's plane and
          // leaves onControlsChange's box the only limit that matters.
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: altHeld ? THREE.MOUSE.ROTATE : undefined,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
          target={[bounds.cx, LOOK_Y, bounds.cz]}
          minZoom={4}
          maxZoom={400}
          onChange={onControlsChange}
        />
      </Canvas>
      <div className="viewport-hint">
        drag = paint/erase · ⌥-drag = orbit · right-drag / arrows = pan · scroll = zoom · {Math.round(zoom)}
      </div>
    </div>
  );
}
