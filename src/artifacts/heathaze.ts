import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { makeRng } from "../generation/proceduralEngine";

const params = [
  { key: "density", label: "Density", kind: "int", min: 10, max: 160, step: 5, default: 70 },
  { key: "twist", label: "Vortex twist", kind: "number", min: 0, max: 3, step: 0.1, default: 1.0 },
  { key: "turbulence", label: "Wave distort", kind: "number", min: 0.2, max: 6, step: 0.2, default: 2.4 },
  { key: "ceiling", label: "Altitude ceiling", kind: "number", min: 0.3, max: 0.95, step: 0.05, default: 0.75 },
  { key: "size", label: "Shimmer size", kind: "number", min: 0.02, max: 0.14, step: 0.005, default: 0.06 },
  { key: "haze", label: "Base haze", kind: "number", min: 0, max: 0.6, step: 0.05, default: 0.25 },
  { key: "frames", label: "Frames", kind: "int", min: 8, max: 48, step: 1, default: 24 },
  { key: "color", label: "Haze color", kind: "color", default: "#F4C98A" },
] as const;

interface Wisp {
  x0: number; // base column position, -1..1
  phase: number; // rise offset so wisps stagger up the column
  dir: number; // spiral handedness, -1 or 1
  wob: number; // per-wisp phase for vortex + shimmer
  size: number;
  alpha: number;
}

/**
 * Thermal heat haze / air currents: columns of soft shimmer wisps that rise off the
 * ground, spiral around a vortex axis (Vortex twist) and ripple with a high-frequency
 * wobble (Wave distort), dissipating before they reach the Altitude ceiling. Rendered to
 * an N-frame looping sprite sheet. Deterministic from (seed, params).
 */
function generate(seed: number, p: ParamValues): GeneratedEffect {
  const rng = makeRng(seed);
  const density = Math.round(p.density as number);
  const twist = p.twist as number;
  const turbulence = p.turbulence as number;
  const ceiling = p.ceiling as number;
  const psize = p.size as number;
  const haze = p.haze as number;
  const frameCount = Math.round(p.frames as number);
  const color = p.color as string;
  const frameSize = 128;

  const wisps: Wisp[] = [];
  for (let i = 0; i < density; i++) {
    wisps.push({
      x0: (rng() * 2 - 1) * 0.8,
      phase: rng(),
      dir: rng() < 0.5 ? -1 : 1,
      wob: rng() * Math.PI * 2,
      size: psize * (0.6 + rng() * 0.8),
      alpha: 0.15 + rng() * 0.3,
    });
  }

  const rgb = hexToRgb(color);

  function drawFrame(ctx: CanvasRenderingContext2D, frame: number, size: number) {
    const t = frame / frameCount; // 0..1 loop phase
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const groundY = size * 0.9; // heat rises off the ground
    const climb = ceiling * size; // travel distance up the flyer grid

    // Soft heat shimmer hugging the ground, fading toward the altitude ceiling. A genuinely
    // radial gradient — not a clipped rect — so it fades to true alpha 0 on its own before its
    // shape's edge; clipping a fill that hadn't already faded out left a visible hard ring.
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

    ctx.globalCompositeOperation = "lighter";
    for (const w of wisps) {
      const rise = (w.phase + t) % 1; // 0 at ground, 1 at ceiling
      const y = groundY - rise * climb;
      // Vortex: spiral that widens as the wisp climbs. twist=0 -> straight rise.
      const vortex =
        Math.sin(rise * Math.PI * 2 * (0.5 + twist) + w.wob) *
        twist * 0.13 * size * (0.2 + rise) * w.dir;
      // Turbulence: high-frequency shimmer that also flickers over the loop.
      const shimmer =
        Math.sin(rise * turbulence * Math.PI * 2 + w.wob * 2 + t * Math.PI * 2) *
        0.025 * size;
      const x = cx + w.x0 * size * 0.42 + vortex + shimmer;
      const pr = w.size * size;
      const a = w.alpha * Math.sin(rise * Math.PI); // fade in off the ground, out at ceiling
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`);
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

export const heatHazeDef: ArtifactDef = {
  type: "heathaze",
  label: "Heat Haze",
  category: "effects",
  output: "effect",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "heathaze",
};
