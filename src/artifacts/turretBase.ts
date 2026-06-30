import { frustum, outQuad } from "../generation/primitives";

/**
 * Shared base for the turret family (AA Turret, Radar Dish/Dome/Array): a stepped armored
 * tower on a flared pyramidal base — two inset boxy tiers, fully enclosed, with seeded
 * greebles on the boxy end of the housing-shape slider. Each family member mounts its own
 * apparatus (gun, dish, dome, array) on the flat roof at (topY, topR), facing local +X
 * (angle 0) — the greeble scatter already excludes that panel for whatever sits there.
 */

/** A small box flush against a polygon-tower panel at angle `ang`: built in the panel's own
 *  radial/tangential frame so it sits coplanar with a flat boxy panel (rather than the curved
 *  frame a circular ring() primitive would impose — see broadcastTower.ts's trim-ring fix for
 *  why that matters). `tCenter`/`tHalf` are tangential offset/half-width along the panel,
 *  `yHalf` vertical half-height, `depth` how far it stands proud of radius `r`. */
export function panelBox(
  P: number[], I: number[],
  ang: number, y: number, r: number, depth: number,
  tCenter: number, tHalf: number, yHalf: number,
): void {
  const dx = Math.cos(ang), dz = Math.sin(ang); // outward radial
  const tx = -dz, tz = dx; // tangential (along the panel)
  const corner = (rad: number, yy: number, t: number): number => {
    P.push(dx * rad + tx * t, yy, dz * rad + tz * t);
    return P.length / 3 - 1;
  };
  const t0 = tCenter - tHalf, t1 = tCenter + tHalf;
  const y0 = y - yHalf, y1 = y + yHalf;
  const bi0 = corner(r, y0, t0), bi1 = corner(r, y0, t1);
  const bo0 = corner(r + depth, y0, t0), bo1 = corner(r + depth, y0, t1);
  const ti0 = corner(r, y1, t0), ti1 = corner(r, y1, t1);
  const to0 = corner(r + depth, y1, t0), to1 = corner(r + depth, y1, t1);
  const cx = dx * (r + depth / 2), cy = y, cz = dz * (r + depth / 2);
  outQuad(P, I, bo0, bo1, to1, to0, cx, cy, cz); // outer
  outQuad(P, I, bi0, ti0, ti1, bi1, cx, cy, cz); // inner
  outQuad(P, I, bo0, to0, ti0, bi0, cx, cy, cz); // side -
  outQuad(P, I, bo1, bi1, ti1, to1, cx, cy, cz); // side +
  outQuad(P, I, bo0, bi0, bi1, bo1, cx, cy, cz); // bottom
  outQuad(P, I, to0, to1, ti1, ti0, cx, cy, cz); // top
}

/** One greeble — armor-plate seam, vent, hatch, equipment box, porthole rivet ring, or a
 *  rivet pair — flush against a tower panel. Kept varied so dense clusters don't repeat. */
export function placeGreeble(
  P: number[], I: number[], kind: number, ang: number, y: number, r: number,
): void {
  if (kind === 0) {
    // Vent: a shallow backing plate with three proud slats.
    panelBox(P, I, ang, y, r, 0.01, 0, 0.04, 0.035);
    for (let k = -1; k <= 1; k++) {
      panelBox(P, I, ang, y + k * 0.022, r + 0.01, 0.009, 0, 0.035, 0.007);
    }
  } else if (kind === 1) {
    // Hatch: a raised cover plate with a hinge bar along its top edge.
    panelBox(P, I, ang, y, r, 0.02, 0, 0.045, 0.045);
    panelBox(P, I, ang, y + 0.045, r + 0.02, 0.01, 0, 0.04, 0.009);
  } else if (kind === 2) {
    // Equipment box: a simple bolted junction box.
    panelBox(P, I, ang, y, r, 0.03, 0, 0.035, 0.03);
  } else if (kind === 3) {
    // Armor-plate seam: a large, low-relief panel outline.
    panelBox(P, I, ang, y, r, 0.006, 0, 0.09, 0.075);
  } else if (kind === 4) {
    // Porthole: a small bolt-ringed disc, proud of the surface.
    frustum(
      P, I,
      [Math.cos(ang) * r, y, Math.sin(ang) * r],
      [Math.cos(ang) * (r + 0.014), y, Math.sin(ang) * (r + 0.014)],
      0.022, 0.018, 8, false, true,
    );
  } else {
    // Rivet pair: two small studs along a seam.
    panelBox(P, I, ang, y, r, 0.009, -0.03, 0.011, 0.011);
    panelBox(P, I, ang, y, r, 0.009, 0.03, 0.011, 0.011);
  }
}

export interface TurretBaseResult {
  /** Y of the flat roof — mount the apparatus here. */
  topY: number;
  /** Radius of the flat roof. */
  topR: number;
  /** Polygon side count used throughout (round end: many; boxy end: down to 4). */
  sides: number;
  /** Vertex range to paint as trim/seam color. */
  trimStart: number;
  trimEnd: number;
  /** Vertex range to paint/weather as the greeble detail (shares the hull tint, but kept
   *  separate so callers can weather it independently if they want). */
  greebleStart: number;
  greebleEnd: number;
}

/**
 * Build the flared base + two stepped boxy tiers + seam trim + greebles into P/I. Returns the
 * flat roof's (topY, topR) so the caller can mount its own apparatus there, plus the vertex
 * ranges needed for paint/weather passes.
 */
export function buildTurretBase(
  P: number[], I: number[], rng: () => number,
  H: number, HALF: number,
  housingShape: number, greebleDensity: number, orn: number,
): TurretBaseResult {
  // Side count blends round (many, thin facets) into boxy (down to a literal 4-sided tower);
  // flare blends a mild cylindrical taper into a strong pyramidal skirt.
  const sides = Math.max(4, Math.round(16 - 12 * housingShape));
  const flare = 0.18 + 0.37 * housingShape;

  // Flared base: the widest part, so it governs the footprint regardless of what mounts up top.
  const baseR = HALF * 0.95;
  const baseTop = H * 0.28;
  const baseTopR = baseR * (1 - flare);
  frustum(P, I, [0, 0, 0], [0, baseTop, 0], baseR, baseTopR, sides, true, true);

  // Tier 1: a near-vertical box seated on the base, inset slightly.
  const t1BaseR = baseTopR * 0.95;
  const t1H = H * 0.24;
  const t1Top = baseTop + t1H;
  const t1TopR = t1BaseR * 0.98;
  frustum(P, I, [0, baseTop, 0], [0, t1Top, 0], t1BaseR, t1TopR, sides, false, true);

  // Tier 2: a smaller inset box stacked on tier 1's sealed ledge — the visible step between
  // the two boxy sections. Flat-roofed; the apparatus seats on it.
  const t2BaseR = t1TopR * 0.8;
  const t2H = H * 0.26;
  const t2Top = t1Top + t2H;
  const t2TopR = t2BaseR * 0.97;
  frustum(P, I, [0, t1Top, 0], [0, t2Top, 0], t2BaseR, t2TopR, sides, false, true);

  const tierRAt = (y: number) => {
    if (y <= t1Top) {
      const t = Math.min(1, Math.max(0, (y - baseTop) / t1H));
      return t1BaseR + (t1TopR - t1BaseR) * t;
    }
    const t = Math.min(1, Math.max(0, (y - t1Top) / t2H));
    return t2BaseR + (t2TopR - t2BaseR) * t;
  };

  // Trim bands at each step seam, scaled by ornamentation. Polygon frustums (not a circular
  // ring()) so they stay flush at any side count, boxy included.
  const trimStart = I.length;
  if (orn > 0.3) {
    const tt = 0.008 + 0.01 * orn;
    frustum(P, I, [0, baseTop - tt, 0], [0, baseTop + tt, 0], t1BaseR * 1.03, t1BaseR * 1.03, sides, false, false);
    frustum(P, I, [0, t1Top - tt, 0], [0, t1Top + tt, 0], t2BaseR * 1.04, t2BaseR * 1.04, sides, false, false);
  }
  const trimEnd = I.length;

  // Greebles: dense armor-plate detail on the boxy end of the housing-shape slider, scaled
  // further by the density slider. Scattered across both tiers, away from angle 0 — that's
  // where the caller's apparatus faces off the roof above.
  const greebleStart = I.length;
  const maxGreebles = 18;
  const greebleCount = Math.round(maxGreebles * housingShape * greebleDensity);
  for (let i = 0; i < greebleCount; i++) {
    const onTier2 = rng() < 0.45;
    const yLo = onTier2 ? t1Top + 0.035 : baseTop + 0.035;
    const yHi = onTier2 ? t2Top - 0.035 : t1Top - 0.035;
    const y = yLo + rng() * Math.max(0.01, yHi - yLo);
    const s = Math.floor(rng() * sides);
    const ang = ((s + 0.5) / sides) * Math.PI * 2;
    const angFromFront = Math.min(ang, Math.PI * 2 - ang);
    if (angFromFront < (1.1 / sides) * Math.PI * 2) continue;
    const kind = Math.floor(rng() * 6);
    placeGreeble(P, I, kind, ang, y, tierRAt(y));
  }
  const greebleEnd = I.length;

  return { topY: t2Top, topR: t2TopR, sides, trimStart, trimEnd, greebleStart, greebleEnd };
}
