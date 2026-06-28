import type { ArtifactDef, GeneratedEffect, ParamValues } from "../types";
import { makeRng } from "../generation/proceduralEngine";

const params = [
  { key: "billowScale", label: "Cloud billow scale", kind: "number", min: 0.4, max: 1.6, step: 0.05, default: 0.9 },
  { key: "puffs", label: "Cloud puffs", kind: "int", min: 4, max: 22, step: 1, default: 12 },
  { key: "density", label: "Density", kind: "number", min: 0.15, max: 1, step: 0.05, default: 0.6 },
  { key: "discharge", label: "Discharge points", kind: "int", min: 0, max: 6, step: 1, default: 3 },
  { key: "frames", label: "Frames", kind: "int", min: 8, max: 48, step: 1, default: 24 },
  { key: "color", label: "Cloud glow", kind: "color", default: "#7BE04F" },
  { key: "boltColor", label: "Bolt color", kind: "color", default: "#E8FFC4" },
] as const;

interface Puff {
  x: number; // -1..1 across the cloud band
  y: number; // fraction of frame height (top band)
  r: number; // radius fraction of frame
  a: number;
}

interface Bolt {
  x0: number; // cloud anchor, -1..1
  targetX: number; // ground strike point, -1..1
  jag: number[]; // per-segment horizontal jitter, -1..1
  branchAt: number; // segment index to fork from, or -1
  branchDir: number;
  flashStart: number; // loop phase the discharge begins
  flashDur: number; // how long the discharge lasts
}

/**
 * Radium storm / lightning clouds: a glowing radioactive cloud mass of overlapping puffs
 * (Cloud billow scale / Density) that periodically fires jagged low-poly lightning tendrils
 * down to the ground from a set of Discharge points. Rendered to an N-frame looping sprite
 * sheet. Deterministic from (seed, params).
 */
function generate(seed: number, p: ParamValues): GeneratedEffect {
  const rng = makeRng(seed);
  const billowScale = p.billowScale as number;
  const puffCount = Math.round(p.puffs as number);
  const density = p.density as number;
  const dischargeCount = Math.round(p.discharge as number);
  const frameCount = Math.round(p.frames as number);
  const color = p.color as string;
  const boltColor = p.boltColor as string;
  const frameSize = 128;

  const puffs: Puff[] = [];
  for (let i = 0; i < puffCount; i++) {
    puffs.push({
      x: (rng() * 2 - 1) * 0.85,
      y: 0.12 + rng() * 0.22,
      r: (0.12 + rng() * 0.16) * billowScale,
      a: 0.4 + rng() * 0.5,
    });
  }

  const bolts: Bolt[] = [];
  for (let b = 0; b < dischargeCount; b++) {
    const x0 = (rng() * 2 - 1) * 0.7;
    const segs = 5 + Math.floor(rng() * 3);
    const jag: number[] = [];
    for (let s = 0; s < segs; s++) jag.push(rng() * 2 - 1);
    bolts.push({
      x0,
      targetX: x0 + (rng() * 2 - 1) * 0.25,
      jag,
      branchAt: rng() < 0.6 ? Math.floor(segs * (0.4 + rng() * 0.3)) : -1,
      branchDir: rng() < 0.5 ? -1 : 1,
      flashStart: rng(),
      flashDur: 0.12 + rng() * 0.14,
    });
  }

  const cloud = hexToRgb(color);
  const bolt = hexToRgb(boltColor);

  function strokePath(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function drawFrame(ctx: CanvasRenderingContext2D, frame: number, size: number) {
    const t = frame / frameCount; // 0..1 loop phase
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const groundY = size * 0.96;
    const anchorY = size * 0.3; // underside of the cloud band

    // Radioactive cloud body: overlapping soft puffs. Density sets opacity/solidness.
    for (const pf of puffs) {
      const drift = Math.sin(t * Math.PI * 2 + pf.x * 3) * 0.01 * size;
      const x = cx + pf.x * size * 0.5 + drift;
      const y = pf.y * size;
      const r = pf.r * size;
      const a = pf.a * density;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${cloud.r},${cloud.g},${cloud.b},${a})`);
      g.addColorStop(0.7, `rgba(${cloud.r},${cloud.g},${cloud.b},${a * 0.5})`);
      g.addColorStop(1, `rgba(${cloud.r},${cloud.g},${cloud.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Discharges: jagged tendrils that flash on their own phase window in the loop.
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let bi = 0; bi < bolts.length; bi++) {
      const bz = bolts[bi];
      let ph = t - bz.flashStart;
      ph -= Math.floor(ph); // 0..1 since this bolt last fired
      if (ph >= bz.flashDur) continue;
      const k = ph / bz.flashDur; // 0..1 across the discharge
      const flick = 0.6 + 0.4 * Math.sin((frame + bi * 3) * 2.3);
      const intensity = Math.sin(k * Math.PI) * flick;
      if (intensity <= 0.02) continue;

      const ax = cx + bz.x0 * size * 0.5;
      const gx = cx + bz.targetX * size * 0.5;
      const n = bz.jag.length;
      const pts: [number, number][] = [[ax, anchorY]];
      for (let s = 1; s <= n; s++) {
        const f = s / n;
        const baseX = ax + (gx - ax) * f;
        const y = anchorY + (groundY - anchorY) * f;
        const jitter = bz.jag[s - 1] * (1 - f) * 0.12 * size; // tightens toward ground
        pts.push([baseX + jitter, y]);
      }

      // Glow halo then bright core.
      ctx.strokeStyle = `rgba(${bolt.r},${bolt.g},${bolt.b},${0.22 * intensity})`;
      ctx.lineWidth = size * 0.045;
      strokePath(ctx, pts);
      ctx.strokeStyle = `rgba(${bolt.r},${bolt.g},${bolt.b},${0.95 * intensity})`;
      ctx.lineWidth = size * 0.014;
      strokePath(ctx, pts);

      // Optional fork.
      if (bz.branchAt > 0 && bz.branchAt < pts.length - 1) {
        const [bx, by] = pts[bz.branchAt];
        const fork: [number, number][] = [[bx, by]];
        const len = 0.25 + (bz.jag[0] + 1) * 0.12;
        fork.push([bx + bz.branchDir * size * 0.18, by + size * len * 0.5]);
        fork.push([bx + bz.branchDir * size * 0.1, by + size * len]);
        ctx.lineWidth = size * 0.01;
        ctx.strokeStyle = `rgba(${bolt.r},${bolt.g},${bolt.b},${0.7 * intensity})`;
        strokePath(ctx, fork);
      }

      // Flash halo at the cloud anchor when the tendril fires.
      const hr = size * 0.16 * intensity;
      const hg = ctx.createRadialGradient(ax, anchorY, 0, ax, anchorY, hr);
      hg.addColorStop(0, `rgba(${bolt.r},${bolt.g},${bolt.b},${0.5 * intensity})`);
      hg.addColorStop(1, `rgba(${bolt.r},${bolt.g},${bolt.b},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(ax, anchorY, hr, 0, Math.PI * 2);
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

export const radiumStormDef: ArtifactDef = {
  type: "radiumstorm",
  label: "Radium Storm",
  category: "effects",
  output: "effect",
  params: params as unknown as ArtifactDef["params"],
  generate,
  fileStem: "radiumstorm",
};
