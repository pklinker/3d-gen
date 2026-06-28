import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";

/**
 * Export a single mesh as a self-contained binary .glb:
 *  - binary (one file), textures/buffers embedded
 *  - transforms baked (we pass a Mesh whose matrix is identity; geometry already
 *    conformed), Y-up (three default), no animations/cameras/lights.
 */
export function exportGlb(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): Promise<ArrayBuffer> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("Expected binary glb output"));
      },
      (err) => reject(err),
      { binary: true, onlyVisible: true, embedImages: true },
    );
  });
}

export function downloadBlob(data: BlobPart, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
