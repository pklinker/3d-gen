import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { makeRng } from "../generation/proceduralEngine";

const params = [
  { key: "density", label: "Density", kind: "int", min: 20, max: 260, step: 5, default: 150 },
  { key: "radius", label: "Radius", kind: "number", min: 0.3, max: 1.0, step: 0.02, default: 0.72 },
  { key: "swirl", label: "Swirl speed", kind: "number", min: 0.2, max: 3, step: 0.1, default: 1.2 },
  { key: "size", label: "Particle size", kind: "number", min: 0.02, max: 0.16, step: 0.005, default: 0.085 },
  { key: "haze", label: "Base haze", kind: "number", min: 0, max: 0.8, step: 0.05, default: 0.4 },
  { key: "frames", label: "Frames", kind: "int", min: 8, max: 48, step: 1, default: 24 },
  { key: "color", label: "Dust color", kind: "color", default: "#C9A66B" },
] as const;

interface Particle {
  ang: number;
  r: number;
  ySeed: number;
  spin: number;
  size: number;
  alpha: number;
}

/**
 * Dust storm: a swirling cloud of soft billboard particles rendered to an
 * N-frame looping sprite sheet. Deterministic from (seed, params).
 */
function generate(seed: number, p: ParamValues): GeneratedEffect {
  const rng = makeRng(seed);
  const density = Math.round(p.density as number);
  const radius = p.radius as number;
  const swirl = p.swirl as number;
  const psize = p.size as number;
  const haze = p.haze as number;
  const frameCount = Math.round(p.frames as number);
  const color = p.color as string;
  const frameSize = 128;

  const particles: Particle[] = [];
  for (let i = 0; i < density; i++) {
    particles.push({
      ang: rng() * Math.PI * 2,
      r: Math.pow(rng(), 0.6) * radius,
      ySeed: rng(),
      spin: (0.5 + rng()) * swirl,
      size: psize * (0.6 + rng() * 0.8),
      alpha: 0.3 + rng() * 0.45,
    });
  }

  const rgb = hexToRgb(color);

  function drawFrame(ctx: CanvasRenderingContext2D, frame: number, size: number) {
    const t = frame / frameCount; // 0..1 loop phase
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size * 0.92; // ground-anchored, storm billows upward
    const scale = size * 0.5;

    // Soft continuous haze column behind the grains, so the storm reads as a body
    // even where particles are sparse. Drifts slightly on the loop phase.
    // The gradient's radius and center are capped/clamped so its zero-alpha edge
    // always lands inside the frame — otherwise the frame boundary cuts through
    // it at non-zero alpha, showing up as a hard rectangular edge.
    if (haze > 0) {
      const marginX = size * 0.06;
      const hr = Math.min(radius * 1.3 * scale, size * 0.5 - marginX);
      const ry = hr * 1.15;
      const marginY = size * 0.03;
      const drift = Math.sin(t * Math.PI * 2) * 0.04 * scale;
      const hx = Math.max(hr + marginX, Math.min(size - hr - marginX, cx + drift));
      const hy = Math.max(ry + marginY, Math.min(size - ry - marginY, cy - radius * 0.9 * scale));
      const hg = ctx.createRadialGradient(hx, hy, hr * 0.1, hx, hy, hr);
      hg.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${haze})`);
      hg.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},${haze * 0.45})`);
      hg.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";
    const pMargin = size * 0.02;
    for (const pt of particles) {
      const ang = pt.ang + t * Math.PI * 2 * pt.spin;
      const r = pt.r;
      const pr = pt.size * scale;
      const x = Math.max(pr + pMargin, Math.min(size - pr - pMargin, cx + Math.cos(ang) * r * scale));
      // vertical billow: looped bob using the frame phase
      const bob = Math.sin((t + pt.ySeed) * Math.PI * 2);
      const y = cy - (pt.ySeed * 1.55 + 0.04) * scale - bob * 0.06 * scale;
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${pt.alpha})`);
      g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
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

export const dustStormDef: ArtifactDef = {
  type: "duststorm",
  label: "Dust Storm",
  category: "effects",
  output: "effect",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "duststorm",
};
