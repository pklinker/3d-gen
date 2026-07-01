import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { makeRng } from "../generation/proceduralEngine";

const params = [
  { key: "density", label: "Puffs", kind: "int", min: 6, max: 26, step: 1, default: 14 },
  { key: "billowScale", label: "Billow scale", kind: "number", min: 0.4, max: 1.6, step: 0.05, default: 1.0 },
  { key: "pulse", label: "Breathing pulse", kind: "number", min: 0, max: 2, step: 0.1, default: 1.0 },
  { key: "drift", label: "Drift sway", kind: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
  { key: "haze", label: "Base haze", kind: "number", min: 0, max: 0.7, step: 0.05, default: 0.35 },
  { key: "frames", label: "Frames", kind: "int", min: 8, max: 48, step: 1, default: 24 },
  { key: "color", label: "Gas color", kind: "color", default: "#79D94F" },
] as const;

interface Puff {
  x: number; // -1..1 across the cloud band
  y: number; // -1..1 within the cloud band
  r: number; // radius fraction of frame
  a: number;
  phase: number;
  freq: number;
  jitter: number;
}

/**
 * Green gas cloud: a hovering mass of overlapping toxic puffs that slowly breathes (Breathing
 * pulse) and sways in place (Drift sway), with a soft base haze filling the gaps between
 * puffs. Rendered to an N-frame looping sprite sheet. Deterministic from (seed, params).
 */
function generate(seed: number, p: ParamValues): GeneratedEffect {
  const rng = makeRng(seed);
  const density = Math.round(p.density as number);
  const billowScale = p.billowScale as number;
  const pulse = p.pulse as number;
  const drift = p.drift as number;
  const haze = p.haze as number;
  const frameCount = Math.round(p.frames as number);
  const color = p.color as string;
  const frameSize = 128;

  const puffs: Puff[] = [];
  for (let i = 0; i < density; i++) {
    puffs.push({
      x: (rng() * 2 - 1) * 0.8,
      y: (rng() * 2 - 1) * 0.55,
      r: (0.14 + rng() * 0.16) * billowScale,
      a: 0.35 + rng() * 0.4,
      phase: rng(),
      freq: 0.6 + rng() * 0.8,
      jitter: rng() * Math.PI * 2,
    });
  }

  const rgb = hexToRgb(color);

  function drawFrame(ctx: CanvasRenderingContext2D, frame: number, size: number) {
    const t = frame / frameCount; // 0..1 loop phase
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size * 0.55;
    const sway = Math.sin(t * Math.PI * 2) * drift * 0.08 * size;

    if (haze > 0) {
      // Cap the haze radius so the soft base ellipse never reaches the frame edge.
      const hr = size * Math.min(0.42 * billowScale, 0.44);
      const hg = ctx.createRadialGradient(cx + sway, cy, hr * 0.1, cx + sway, cy, hr);
      hg.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${haze})`);
      hg.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},${haze * 0.45})`);
      hg.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(cx + sway, cy, hr, hr * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ordinary alpha blending for the cloud body (matching radiumStorm's puff cloud) — additive
    // "lighter" blending blows overlapping puffs out to white well before density looks toxic.
    // Cap the (pulsed) radius and clamp each puff center so the billow never spills past the
    // frame edges, which would otherwise show as a hard rectangular cutoff.
    const margin = size * 0.03;
    for (const pf of puffs) {
      // breathe wraps to the same value at t=0 and t=1 regardless of freq, so the
      // per-puff pulse stays seamless across the sprite-sheet loop boundary.
      const breathe = (pf.phase + t) % 1;
      const pulseAmt = 1 + Math.sin(breathe * Math.PI * 2 * pf.freq + pf.jitter) * pulse * 0.22;
      const r = Math.min(pf.r * size * pulseAmt, size * 0.26);
      const lo = r + margin;
      const hi = size - r - margin;
      const x = Math.max(lo, Math.min(hi, cx + sway + pf.x * size * 0.42));
      const y = Math.max(lo, Math.min(hi, cy + pf.y * size * 0.42));
      const a = pf.a * (0.7 + 0.3 * pulseAmt);
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`);
      g.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${a * 0.5})`);
      g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { kind: "effect", frameCount, frameSize, drawFrame };
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export const gasCloudDef: ArtifactDef = {
  type: "gascloud",
  label: "Gas Cloud",
  category: "effects",
  output: "effect",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "gascloud",
};
