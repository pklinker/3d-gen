import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { makeRng } from "../generation/proceduralEngine";

const params = [
  { key: "density", label: "Density", kind: "int", min: 10, max: 200, step: 5, default: 90 },
  { key: "billow", label: "Billow drift", kind: "number", min: 0.2, max: 3, step: 0.1, default: 1.2 },
  { key: "turbulence", label: "Turbulence", kind: "number", min: 0.2, max: 4, step: 0.2, default: 1.6 },
  { key: "ceiling", label: "Altitude ceiling", kind: "number", min: 0.3, max: 0.95, step: 0.05, default: 0.82 },
  { key: "size", label: "Puff size", kind: "number", min: 0.04, max: 0.22, step: 0.005, default: 0.11 },
  { key: "haze", label: "Base haze", kind: "number", min: 0, max: 0.6, step: 0.05, default: 0.3 },
  { key: "frames", label: "Frames", kind: "int", min: 8, max: 48, step: 1, default: 24 },
  { key: "color", label: "Smoke color", kind: "color", default: "#262420" },
] as const;

interface Puff {
  x0: number;
  phase: number;
  dir: number;
  wob: number;
  size: number;
  alpha: number;
}

/**
 * Black smoke: a column of dark puffs that rise off a source point, billowing sideways and
 * expanding as they climb, thinning out before they reach the Altitude ceiling. Rendered to
 * an N-frame looping sprite sheet. Deterministic from (seed, params).
 */
function generate(seed: number, p: ParamValues): GeneratedEffect {
  const rng = makeRng(seed);
  const density = Math.round(p.density as number);
  const billow = p.billow as number;
  const turbulence = p.turbulence as number;
  const ceiling = p.ceiling as number;
  const psize = p.size as number;
  const haze = p.haze as number;
  const frameCount = Math.round(p.frames as number);
  const color = p.color as string;
  const frameSize = 128;

  const puffs: Puff[] = [];
  for (let i = 0; i < density; i++) {
    puffs.push({
      x0: (rng() * 2 - 1) * 0.18, // narrow at the source, plume widens with billow as it rises
      phase: rng(),
      dir: rng() < 0.5 ? -1 : 1,
      wob: rng() * Math.PI * 2,
      size: psize * (0.5 + rng() * 0.9),
      alpha: 0.25 + rng() * 0.4,
    });
  }

  const rgb = hexToRgb(color);

  function drawFrame(ctx: CanvasRenderingContext2D, frame: number, size: number) {
    const t = frame / frameCount; // 0..1 loop phase
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const groundY = size * 0.92; // smoke rises off a source near the bottom
    const climb = ceiling * size;

    // Soft continuous haze column behind the puffs so the plume reads as a body even where
    // puffs are sparse. A genuinely radial gradient — not a clipped rect — so it fades to true
    // alpha 0 on its own before its shape's edge; clipping a fill that hadn't already faded out
    // left a visible hard ring.
    if (haze > 0) {
      ctx.save();
      ctx.translate(cx, groundY - climb * 0.5);
      ctx.scale(size * 0.34, climb * 0.62);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      hg.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${haze})`);
      hg.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Dark smoke needs ordinary alpha blending, not the additive "lighter" mode the bright
    // effects use — adding near-black color values together is a visual no-op.
    for (const pf of puffs) {
      const rise = (pf.phase + t) % 1; // 0 at source, 1 at ceiling
      const y = groundY - rise * climb;
      const sway =
        Math.sin(rise * Math.PI * 2 * (0.6 + billow) + pf.wob) *
        billow * 0.1 * size * (0.2 + rise) * pf.dir;
      const shimmer =
        Math.sin(rise * turbulence * Math.PI * 2 + pf.wob * 2) * 0.03 * size * rise;
      const x = cx + pf.x0 * size + sway + shimmer;
      const pr = pf.size * size * (0.6 + rise * 1.1); // puffs expand as the plume disperses
      const a = pf.alpha * Math.sin(Math.min(1, rise) * Math.PI); // fade in off the source, out at ceiling
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`);
      g.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${a * 0.55})`);
      g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
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

export const smokeDef: ArtifactDef = {
  type: "smoke",
  label: "Black Smoke",
  category: "effects",
  output: "effect",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "smoke",
};
