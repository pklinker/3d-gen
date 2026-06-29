# DESIGN.md — Terrain Artifact Editor

Design system and UI rules for this editor. Calibrate design changes against this
file; deviations are intentional decisions, not drift. Source of truth for tokens
is `src/styles.css` (`:root`).

## What this is

An **app UI**, not a marketing page: a dense, mouse-driven desktop workspace
(Vite + React + Three.js, Tauri target). Judge it by app-UI rules — calm surface
hierarchy, strong typography, few colors, one accent. Not by landing-page rules.

Three-column layout: left rail = generation controls, center = viewport, right =
contract validation + export.

## Tokens (from `src/styles.css`)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#14130f` | Page / recessed track |
| `--panel` | `#1f1d18` | Panel surface |
| `--panel2` | `#262219` | Control surface (buttons, inputs) |
| `--border` | `#3a3427` | Hairline border / divider |
| `--text` | `#e8e1d0` | Body text |
| `--muted` | `#9a9382` | Secondary text, labels |
| `--accent` | `#d9a441` | The one accent (gold) |
| `--ok` | `#6fcf6f` | Pass / success |
| `--bad` | `#e06b5a` | Fail / error |

Font: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`).
Acceptable for a dense internal tool; do not add a second UI typeface.

Radius: `6px` controls. Spacing: 4/6/8/10/14/16/20px scale — stay on it.

## Core principles

1. **One accent, spent once per view.** Gold is the loudest signal. Solid-gold
   *fill* marks exactly one thing: the current selection (or the single primary
   action, e.g. Export). Higher-level nav and section state use quieter
   treatments (underline, indentation, muted labels) — never another gold fill.
   If two gold blocks are lit at once, that's a bug.
2. **Hierarchy by structure, not just color.** Levels are expressed by position
   and indentation first; color only marks the active leaf.
3. **Label every region.** Use the uppercase muted `h2` pattern
   (`text-transform: uppercase; letter-spacing: 0.08em; color: --muted`) for
   section headers in *both* rails. The left rail must be labeled like the right.
4. **No emoji as UI.** Icon-only controls get a real icon + `aria-label`/`title`.
   (e.g. the seed randomize control — label it, don't ship a bare 🎲.)
5. **Density is intentional.** ~28–30px control height is fine for this
   mouse-driven desktop tool; the 44px touch minimum only applies if a touch
   surface is ever targeted.
6. **Copy: utility voice.** Section headings name the area or action
   ("Type", "Generation", "Contract", "Export"). No mood/brand/marketing copy.
7. **Cards earn their place.** No decorative card grids; a card only when the
   card *is* the interaction.

## Navigation / menu system (the artifact taxonomy)

The taxonomy is growing on two axes: more top-level categories (terrain,
buildings, effects, vehicles, flora, …) and a new middle level
(category → subcategory → type). The menu must scale on both. Rules:

- **Vertical recursive accordion, top level included.** Do not use a horizontal
  category tab strip — it caps out at ~4–5 items in the 300px rail and cannot
  nest a third level. Render the whole taxonomy as one indented tree.
  - Category → expandable parent row
  - Subcategory → nested expandable row (~12px indent)
  - Type → selectable leaf; gold fill on the selected leaf only
- **Single-expand at each level (accordion).** One category open, one
  subcategory open, so the param sliders below stay reachable without a long
  scroll.
- **Nesting cap: 3 levels.** category → subcategory → type. No deeper — indents
  eat horizontal room and long labels (e.g. "Radium Mooring Spire") get cramped.
- **Auto-expand the path to the current selection** on load.
- **Indent with a thin guide.** 12px indent + a `--border` left rule per level.
- **`Procedural / AI` is a mode, not a taxonomy node.** Keep it as a segmented
  toggle in a recessed (`--bg`) track *below* the tree, under a `GENERATION`
  label. Same for presets and the hex-mask utility — global controls live
  outside the tree.
- **Add a filter field at ~20–25 artifacts.** A type-to-filter box at the top of
  the menu that flattens the tree to matches. Hierarchy is for browsing; filter
  is for re-finding. (Currently 17 artifacts — add this when vehicles land.)

### Render from the registry, not hardcoded levels

The menu must render *from* data so adding content never touches menu components.

- Add a typed `subcategory` (or `group`) field to `ArtifactDef` in `src/types.ts`;
  type the subcategory ids, don't leave a loose string.
- Express category → subcategory order as data (extend `CATEGORIES` in
  `src/artifacts/registry.ts`).
- Replace the flat `artifactsInCategory()` consumption with a `groupedTree()`
  selector and one recursive tree component.
- Result: "Vehicles → Ground → Rover" is data-only — register the artifact with
  `category:"vehicles", subcategory:"ground"` plus labels. Zero menu edits.

## Known cleanups (open)

These were found in a design review of the current tab-based menu and remain
until the tree lands:

- **F1/F5** Three nav levels (category / type / mode) share one gold-fill
  treatment — three gold blocks light at once. Fixed by the accordion (one leaf
  highlight).
- **F2** Inverted size hierarchy: category tabs are `12px` (`styles.css:57`),
  smaller than the `13px` type tabs they outrank. Primary nav ≥ secondary.
- **F3** Type tabs are a ragged `flex-wrap` pill cloud (`styles.css:52`); hard to
  scan. Fixed by the vertical tree.
- **F4** Left rail has no section labels while the right rail does. Add
  `TYPE` / `GENERATION` headers.
- **F6** `🎲` emoji button has no `aria-label`/`title` (`App.tsx:182`).
