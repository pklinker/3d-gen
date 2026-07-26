// GLTFExporter touches no canvas for these meshes (vertex colors, no textures), so the
// export path runs in the "node" environment the rest of the suite uses.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getArtifact } from "../../artifacts/registry";
import { defaultParams } from "../../types";
import { conformGeometry, makeContractMaterial } from "../../generation/conform";
import { SURFACE_ORDER } from "../../contract/surfaces";
import { exportGlb } from "../gltfExport";

/** Parse a .glb container's JSON chunk: 12-byte header, then a length-prefixed chunk. */
function glbJson(buf: ArrayBuffer): {
  meshes: { primitives: { material?: number }[] }[];
  materials: { name?: string }[];
} {
  const jsonLen = new DataView(buf).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
}

async function exportArtifact(type: Parameters<typeof getArtifact>[0]) {
  const a = getArtifact(type);
  const raw = a.generate(1, defaultParams(a.params)) as { geometry: THREE.BufferGeometry };
  const { geometry } = conformGeometry(raw.geometry, a.contract!, { category: a.category });
  const material = makeContractMaterial(a.contract!, geometry);
  return { geometry, glb: glbJson(await exportGlb(geometry, material)) };
}

describe("exportGlb — surface groups become glTF primitives", () => {
  it("emits one primitive per surface group, each with its own material", async () => {
    const { geometry, glb } = await exportArtifact("attack");
    expect(geometry.groups.length).toBeGreaterThan(1);
    expect(glb.meshes[0].primitives).toHaveLength(geometry.groups.length);
    // The attack ship is the one artifact carrying a glazed canopy.
    expect(glb.materials.map((m) => m.name)).toContain("glass");
  });

  it("exports only the finish slots actually used, not the whole slot array", async () => {
    // makeContractMaterial hands the exporter all SURFACE_ORDER entries so a group's
    // materialIndex means the same thing everywhere; entries no primitive references must
    // never reach the file, or every asset would carry six dead materials.
    const { glb } = await exportArtifact("battleship");
    expect(glb.materials.length).toBeLessThan(SURFACE_ORDER.length);
    for (const m of glb.materials) expect(SURFACE_ORDER).toContain(m.name);
  });

  it("an ungrouped artifact still exports as a single primitive", async () => {
    const { geometry, glb } = await exportArtifact("hill");
    expect(geometry.groups).toHaveLength(0);
    expect(glb.meshes[0].primitives).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
  });
});
