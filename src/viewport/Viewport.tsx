import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MAP_BG, ROTATION_STEP_DEG, READ_CHECK_PX } from "../contract/constants";
import type { GeneratedEffect } from "../types";

// Match the game's bake rig (ui/terrain_models.gd): orthographic camera looking
// from +Z (north) at 35° elevation toward the model's mid-height. The field
// rotation spins the model (the pivot), not the camera.
const ISO_ELEVATION_DEG = 35;
const LOOK_Y = 0.4;
const CAM_DIST = 10;
const elev = (ISO_ELEVATION_DEG * Math.PI) / 180;
const CAM_POS: [number, number, number] = [
  0,
  LOOK_Y + Math.sin(elev) * CAM_DIST,
  Math.cos(elev) * CAM_DIST,
];

interface ViewportProps {
  meshGeometry: THREE.BufferGeometry | null;
  meshMaterial: THREE.Material | null;
  effect: GeneratedEffect | null;
  fieldRotationDeg: number;
  snapRotation: boolean;
  readCheck: boolean;
}

/** Hex ring at circumradius = 1 (pointy-top), drawn on the Y=0 plane. */
function HexFootprint() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      pts.push(new THREE.Vector3(Math.cos(a), 0.001, Math.sin(a)));
    }
    return pts;
  }, []);
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color="#5a4218" />
    </lineLoop>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={MAP_BG} roughness={1} metalness={0} />
      </mesh>
      <gridHelper args={[8, 16, "#a98c52", "#b89a60"]} position={[0, 0.002, 0]} />
    </>
  );
}

/** Effect billboard: animates the effect's frames as a texture on a quad. */
function EffectBillboard({ effect }: { effect: GeneratedEffect }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = effect.frameSize;
    c.height = effect.frameSize;
    return c;
  }, [effect]);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const start = useRef(performance.now());
  useFrame(() => {
    const ctx = canvas.getContext("2d")!;
    const elapsed = (performance.now() - start.current) / 1000;
    const frame = Math.floor((elapsed * 24) % effect.frameCount);
    effect.drawFrame(ctx, frame, effect.frameSize);
    tex.needsUpdate = true;
  });
  return (
    <mesh position={[0, 0.75, 0]}>
      <planeGeometry args={[1.8, 1.8]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function Content({ meshGeometry, meshMaterial, effect, fieldRotationDeg, snapRotation }: ViewportProps) {
  const group = useRef<THREE.Group>(null);
  const snapped = snapRotation
    ? Math.round(fieldRotationDeg / ROTATION_STEP_DEG) * ROTATION_STEP_DEG
    : fieldRotationDeg;
  useFrame(() => {
    if (group.current) group.current.rotation.y = THREE.MathUtils.degToRad(snapped);
  });
  return (
    <group ref={group}>
      {meshGeometry && meshMaterial && (
        <mesh geometry={meshGeometry} material={meshMaterial} castShadow />
      )}
      {effect && <EffectBillboard effect={effect} />}
    </group>
  );
}

/** Isometric orthographic camera roughly matching the game's bake angle. */
function IsoCamera() {
  const { camera } = useThree();
  useMemo(() => {
    camera.position.set(...CAM_POS);
    camera.lookAt(0, LOOK_Y, 0);
  }, [camera]);
  return null;
}

export default function Viewport(props: ViewportProps) {
  const [zoom, setZoom] = useState(180);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        camera={{ zoom, position: CAM_POS, near: -50, far: 50 }}
        style={{ background: "#1c1a16" }}
        shadows
      >
        <IsoCamera />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 6, 2]} intensity={1.1} castShadow />
        <Ground />
        <HexFootprint />
        <Content {...props} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minZoom={40}
          maxZoom={600}
          onChange={(e) => e && setZoom((e.target.object as THREE.OrthographicCamera).zoom)}
        />
      </Canvas>

      {props.readCheck && (
        <ReadCheckOverlay {...props} />
      )}
      <div className="viewport-hint">drag = orbit · scroll = zoom · {Math.round(zoom)}</div>
    </div>
  );
}

/** Small offscreen-style preview at READ_CHECK_PX to judge small-zoom legibility. */
function ReadCheckOverlay(props: ViewportProps) {
  return (
    <div
      className="read-check"
      style={{ width: READ_CHECK_PX / 2, height: READ_CHECK_PX / 2 }}
    >
      <Canvas
        orthographic
        camera={{
          // frame ~2.6 hex units across the 128px overlay, matching the game's
          // MODEL_FRAME_UNITS bake so this read-check mirrors the in-game size.
          zoom: READ_CHECK_PX / 2 / 2.6,
          position: CAM_POS,
          near: -50,
          far: 50,
        }}
        style={{ background: MAP_BG }}
      >
        <IsoCamera />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 2]} intensity={1.0} />
        <Content {...props} />
      </Canvas>
      <span>~{READ_CHECK_PX}px read</span>
    </div>
  );
}
