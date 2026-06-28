import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

// Pluggable text-to-3D provider. Keys come from Vite env (.env.local), never
// committed: VITE_MESHY_KEY or VITE_TRIPO_KEY. If neither is set the AI tab is
// disabled and procedural generation still works fully offline.

export type ProviderName = "meshy" | "tripo" | "none";

export function activeProvider(): ProviderName {
  if (import.meta.env.VITE_MESHY_KEY) return "meshy";
  if (import.meta.env.VITE_TRIPO_KEY) return "tripo";
  return "none";
}

export interface AiJobUpdate {
  status: string;
  progress: number; // 0..100
}

/**
 * Kick off a text-to-3D job and resolve to the first mesh geometry of the
 * downloaded .glb. Provider REST flows differ; this wraps the common
 * "create job -> poll -> download glb" shape. Implemented for Meshy; Tripo
 * follows the same structure (left as a typed stub to fill with a key present).
 */
export async function generateFromPrompt(
  prompt: string,
  onUpdate: (u: AiJobUpdate) => void,
): Promise<THREE.BufferGeometry> {
  const provider = activeProvider();
  if (provider === "none") {
    throw new Error("No AI provider key set (VITE_MESHY_KEY / VITE_TRIPO_KEY).");
  }

  const glbUrl =
    provider === "meshy"
      ? await runMeshy(prompt, onUpdate)
      : await runTripo(prompt, onUpdate);

  onUpdate({ status: "downloading", progress: 95 });
  const buf = await (await fetch(glbUrl)).arrayBuffer();
  const geo = await firstGeometry(buf);
  onUpdate({ status: "done", progress: 100 });
  return geo;
}

async function runMeshy(
  prompt: string,
  onUpdate: (u: AiJobUpdate) => void,
): Promise<string> {
  const key = import.meta.env.VITE_MESHY_KEY as string;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  onUpdate({ status: "submitting", progress: 5 });
  const create = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
    method: "POST",
    headers,
    body: JSON.stringify({
      mode: "preview",
      prompt,
      art_style: "sculpture",
      topology: "triangle",
      target_polycount: 3000,
    }),
  }).then((r) => r.json());
  const id = create.result;

  // Poll until finished.
  for (;;) {
    await sleep(3000);
    const job = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${id}`, {
      headers,
    }).then((r) => r.json());
    onUpdate({ status: job.status, progress: Math.min(90, job.progress ?? 50) });
    if (job.status === "SUCCEEDED") return job.model_urls.glb;
    if (job.status === "FAILED") throw new Error("Meshy job failed");
  }
}

async function runTripo(
  _prompt: string,
  _onUpdate: (u: AiJobUpdate) => void,
): Promise<string> {
  // Same shape as Meshy: create task, poll task, return glb url.
  // Fill in once a VITE_TRIPO_KEY is available.
  throw new Error("Tripo provider not yet wired — set VITE_MESHY_KEY to use Meshy.");
}

function firstGeometry(buf: ArrayBuffer): Promise<THREE.BufferGeometry> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buf,
      "",
      (gltf) => {
        let found: THREE.BufferGeometry | null = null;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          if (!found && (o as THREE.Mesh).isMesh) {
            const m = o as THREE.Mesh;
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld); // bake transforms
            found = g;
          }
        });
        if (found) resolve(found);
        else reject(new Error("No mesh in glb"));
      },
      (err) => reject(err),
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
