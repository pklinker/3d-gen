# TODO — Manual Greeble Placement

`cruiser.ts` now has a first slice of user-controllable greebles: `clutterDensity` scales the
existing seeded `deckClutter` scatter, and `bowAntenna` is a boolean-toggled prop placed at a
fixed station regardless of seed (see `src/artifacts/cruiser.ts`). That covers "how many" and
"on/off" — it does **not** let a user choose *where* on the hull a greeble sits. Capturing that
larger piece of work here so it can be picked up later.

## Goal

Let a user click a point on a ship's hull in the viewport and drop a greeble there (antenna,
vent, hatch, pipe run, sensor dish, …), drag it to reposition, and have that placement persist
and re-render deterministically alongside the seeded/randomized greebles.

## Why this is a bigger lift than sliders

The slider approach (`clutterDensity`, `bowAntenna`) works because params are scalar values fed
straight into a pure `generate(seed, params)` function — no new state shape, no UI beyond what
`ParamPanel.tsx` already renders for `kind: "number" | "bool"`. Manual placement breaks that
model: it needs arbitrary-length, per-instance data (greeble type + position + rotation/scale),
a pick surface in the 3D viewport, and a way to keep that data attached to *this* hull's current
geometry as other params (and the seed) change the hull shape under it.

## Pieces of work

- **Greeble kit library** — extract a small set of reusable, parameterized prop builders
  (antenna, vent nozzle, hatch, pipe run, sensor dish) out of the ad-hoc inline code currently
  living in each artifact file (e.g. the antenna `tube()` call in `cruiser.ts`, the vent loop in
  `atmosphere.ts`). Each builder should take a placement (origin + normal/up) and emit
  triangle soup, independent of which ship it's attached to.
- **Placement data model** — `ParamValues` (`src/types.ts`) is `Record<string, number | boolean
  | string>`; it has no slot for a list of placed instances. Needs a new field, e.g.
  `greebles: { kind: string; u: number; v: number; rotation: number; scale: number }[]`, stored
  per-artifact alongside the existing scalar params. Decide whether `u`/`v` are hull
  station/angle coordinates (stable as the hull deforms under other sliders) rather than raw
  world-space XYZ (would drift when e.g. `cabinSize` or `prowLength` changes the hull shape).
- **Pick surface in the viewport** — `src/viewport/Viewport.tsx` renders the generated mesh;
  needs raycasting against it on click to resolve a world-space hit point back into the
  station/angle (`u`/`v`) coordinates the hull generator already uses internally (see `station()`
  / `ringAt()` in `cruiser.ts` for the existing parameterization to reuse).
- **Drag-to-reposition + delete** — once a greeble is placed, needs a way to select, move, and
  remove it without re-clicking from scratch. Likely a lightweight list UI (sidebar) plus
  in-viewport gizmo, not just raw click-to-place.
- **Generator wiring** — each `generate(seed, params)` function needs to read
  `params.greebles`, resolve each instance's `u`/`v` against its own `station()`/surface
  function, and append the corresponding kit builder's geometry — after the seeded/random
  greebles so manual placements can deliberately overlap or replace them.
- **Validation** — manually placed greebles can intersect hull geometry, turrets, or each other
  in ways the seeded scatter (`deckClutter`) avoids by construction (it only scatters within a
  caller-chosen clear band). Decide whether to clamp/reject placements outside valid bands per
  artifact, or accept that manual placement is a power-user feature with no guardrails.

## Suggested order

1. Greeble kit library first — it's useful immediately even before placement UI exists (artifact
   authors can already use it to add more `bowAntenna`-style toggles by hand).
2. Placement data model + generator wiring, tested by hand-authoring a `greebles` array in code
   (no UI yet) to confirm hulls render correctly as other params change.
3. Pick surface + click-to-place UI.
4. Drag/select/delete UI.

## Files involved (current slider-only state, for reference)

- `src/artifacts/cruiser.ts` — `clutterDensity`, `bowAntenna` params; `deckClutter` call; manual
  antenna `tube()` block.
- `src/generation/primitives.ts` — `deckClutter`, `tube`, `box`, `frustum`, `dome` and other
  shape builders greeble kit pieces would be built from.
- `src/ui/ParamPanel.tsx` — renders `number`/`int`/`bool`/`color` param controls; would need a
  new control kind (or a separate panel) for an instance list.
- `src/types.ts` — `ParamSpec`, `ParamValues`; placement data needs a new shape here.
- `src/viewport/Viewport.tsx` — where raycasting/picking against the generated mesh would live.
