# TODO — Hex Boundary Mask, Phases 2 & 3

Phase 1 shipped: a persistent **Hex Boundary Mask** toggle at the bottom of the left panel.
When on it (a) draws a faint filled hex cell overlay in the viewport, and (b) makes `conformGeometry`
fit the footprint within the hex flat-to-flat width (`HEX_FLAT_TO_FLAT = √3` circumradius units)
so features don't overhang the flat edges. It never upscales past a type's contract footprint,
so types already inside the hex (towers, spires, …) are unaffected.

What Phase 1 deliberately does **not** do — captured here so we can pick it up later.

## Phase 2 — true geometric clip to the 6 hex edges (terrain only)

Phase 1 only *scales* the footprint; geometry can still poke past the hex **corners** (a square
bbox of width √3 still has corners outside a pointy-top hex near its vertices). A real clip cuts
the mesh at the six hex-edge planes.

- Plane-clip the conformed geometry against the 6 edge planes of the pointy-top hex (apothem √3/2).
- Re-cap the cut faces — open boundaries break the matte material and validation expects closed-ish meshes.
- Guard the triangle budget; clipping adds geometry, and `SimplifyModifier` already throws on
  non-manifold input (see the `catch` in `conform.ts`), so the clip must keep output manifold or the
  decimation fallback silently no-ops.
- Scope to the **terrain** category only — a hex clip on a tower / spires / atmosphere plant / ramparts
  is meaningless or harmful. Phase 1's scale rule is a safe global no-op for those; a clip is not.
- Rotation interaction: a hex self-aligns only at 60° steps, but Field rotation snaps to 15°
  (`ROTATION_STEP_DEG`). Clip must happen in the fixed game-hex frame, and for clip correctness
  rotation should be constrained to 60° multiples (or the clip applied after rotation).

## Phase 3 — cross-hex continuity (design first, then build)

Clipping one tile stops overflow; it does **not** make a canyon/wall flow into its neighbor. Genuine
seamless tiling needs an **edge contract** shared across tile types:

- Deterministic edge profiles keyed to the *shared* edge (both tiles derive the same boundary curve),
  i.e. a socket/seam convention, not per-tile clipping.
- Decide the seam representation (height samples along each of the 6 edges? a small set of edge "types"?)
  and how generators consume it.
- Write the spec before any code — this is a data-model decision, not a rendering tweak.

## Files involved (Phase 1, for reference)

- `src/contract/constants.ts` — `HEX_FLAT_TO_FLAT`.
- `src/generation/conform.ts` — `conformGeometry(..., { fitToHex })`.
- `src/viewport/Viewport.tsx` — `HexMaskFill` overlay + `hexMask` prop.
- `src/App.tsx` — `hexMask` state, toggle UI, wiring to conform + viewport.
- `src/styles.css` — `.utility`, `.panel.left` flex column.
