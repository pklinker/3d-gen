import { useState } from "react";
import * as THREE from "three";
import { activeProvider, generateFromPrompt } from "../generation/aiProvider";

interface Props {
  promptSeed: string;
  onResult: (geo: THREE.BufferGeometry, source: string) => void;
}

export default function PromptTab({ promptSeed, onResult }: Props) {
  const provider = activeProvider();
  const [prompt, setPrompt] = useState(promptSeed);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (provider === "none") {
    return (
      <div className="muted small">
        AI generation disabled. Set <code>VITE_MESHY_KEY</code> (or{" "}
        <code>VITE_TRIPO_KEY</code>) in <code>.env.local</code> to enable.
        Procedural generation works without a key.
      </div>
    );
  }

  async function run() {
    setBusy(true);
    setStatus("starting…");
    try {
      const geo = await generateFromPrompt(prompt, (u) =>
        setStatus(`${u.status} ${u.progress}%`),
      );
      onResult(geo, provider);
      setStatus("done — conformed to contract");
    } catch (e) {
      setStatus(`failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prompt-tab">
      <div className="muted small">Provider: {provider}</div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
      <button className="primary" disabled={busy} onClick={run}>
        {busy ? "Generating…" : "Generate with AI"}
      </button>
      {status && <div className="status">{status}</div>}
    </div>
  );
}
