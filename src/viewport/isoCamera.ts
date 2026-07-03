import { useMemo } from "react";
import { useThree } from "@react-three/fiber";

// Shared isometric camera rig — extracted from Viewport.tsx so MapViewport.tsx
// (the Maps painter) uses the exact same angle as the single-artifact preview,
// matching the game's bake rig (ui/model_baker.gd): orthographic, looking from
// +Z at 35° elevation.

export const ISO_ELEVATION_DEG = 35;
export const LOOK_Y = 0.4;
export const CAM_DIST = 10;

const elev = (ISO_ELEVATION_DEG * Math.PI) / 180;
// Fixed camera-to-target offset at the rig's angle/distance — a camera looking
// at any (lookX, lookY, lookZ) sits at target + OFFSET, so re-centering the
// look target (e.g. on a map board's centroid) never changes the angle.
const OFFSET: [number, number, number] = [0, Math.sin(elev) * CAM_DIST, Math.cos(elev) * CAM_DIST];

/** Camera position when looking at the origin — Viewport.tsx's single-artifact
 *  preview always does, so this is its exact (and only) camera position. */
export const CAM_POS: [number, number, number] = [OFFSET[0], LOOK_Y + OFFSET[1], OFFSET[2]];

export function camPosForTarget(lookX: number, lookY: number, lookZ: number): [number, number, number] {
  return [lookX + OFFSET[0], lookY + OFFSET[1], lookZ + OFFSET[2]];
}

/** Point the active camera at the iso rig's look target (default: the origin,
 *  matching Viewport.tsx's single-artifact preview). Callers still supply their
 *  own <Canvas camera={{ position: ..., ... }}> for the first-frame position —
 *  this effect corrects it and keeps it correct if the target moves (e.g. a
 *  Maps board's centroid changing when its size changes). */
export function IsoCamera({ lookX = 0, lookY = LOOK_Y, lookZ = 0 }: { lookX?: number; lookY?: number; lookZ?: number } = {}) {
  const { camera } = useThree();
  useMemo(() => {
    camera.position.set(...camPosForTarget(lookX, lookY, lookZ));
    camera.lookAt(lookX, lookY, lookZ);
  }, [camera, lookX, lookY, lookZ]);
  return null;
}
