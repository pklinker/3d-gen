# 3d-gen — Low-Poly Terrain Artifact Editor

A local, browser-based editor for **generating, validating, previewing, and
exporting** stylized low-poly terrain artifacts for a hexagonal-grid game —
hills/mesas, ruined towers, dust storms, and more. Built with Vite + React +
Three.js.

The point isn't just to model assets — it's to make every asset **provably
correct for the game before it ships**. The game renders authored `.glb` terrain
by baking each model to a sprite at runtime (an offscreen `Camera3D` + a
`SubViewport`, cached per ~15° of field rotation), and falls back to a procedural
prism when no model is present. That bake is unforgiving about scale, orientation,
and anchoring. This editor encodes those rules as a **contract** and enforces it
on every model, so a hill always fills its hex and a tower always stands flush on
the ground.

---

## What it does

- **Two ways to create** — tune deterministic procedural generators with sliders +
  a seed, *or* generate from a text prompt via an AI provider (Meshy/Tripo). Both
  paths flow through the same conforming + validation pipeline.
- **Contract enforcement** — automatic recenter, drop-to-ground, rescale into
  hex units, triangle-budget decimation, and a matte PBR / palette material pass.
  A live checklist turns green only when the asset is game-ready; mesh export is
  gated on it.
- **Game-accurate preview** — an orthographic isometric viewport that mirrors the
  game's bake camera (looking from +Z at 35°, model spun by a field-rotation
  slider with 15° snap), a `Y=0` ground plane, a hex guide ring at circumradius 1,
  and a small "read check" overlay to judge legibility at in-game size.
- **One-click export** — mesh artifacts export as self-contained binary `.glb`
  (embedded textures, applied transforms); effect artifacts export as a
  sprite-sheet PNG + a params JSON. Optionally writes straight into the game's
  `assets/terrain/` and appends a credits line.
- **Variants & presets** — pick a variant slot (the game scans `_1`…`_5`), and
  save/load `{type, seed, params}` presets so any look stays reproducible and
  editable later.

## Artifact categories

The UI is organized into category tabs; adding a new type is one file plus one
registry line.

| Category | Type | Output | Notes |
|---|---|---|---|
| **Terrain** | Hill / Mesa | `.glb` | broad, low, flat-topped, faceted ochre |
| **Buildings** | Ruined Tower | `.glb` | slender crumbling spire, pale marble |
| **Effects** | Dust Storm | sprite sheet + JSON | looping billboard animation |

---

## Getting started

Requires Node 18+ (developed on Node 24) and a WebGL-capable browser.

```bash
npm install
npm run dev      # serves the editor at http://localhost:5180
```

Other scripts:

```bash
npm run build    # typecheck + production build to dist/
npm run preview  # preview the production build
```

### Optional: AI generation

The AI tab is disabled unless a provider key is present. Copy the example env and
add a key:

```bash
cp .env.local.example .env.local
# then set one of:
#   VITE_MESHY_KEY=...
#   VITE_TRIPO_KEY=...
```

AI output is downloaded and run through the *same* conform pipeline as procedural
models, so it lands on-contract. Procedural generation works fully offline with
no key.

---

## Using the editor

1. **Pick a category and type** (e.g. Terrain → Hill / Mesa).
2. **Generate** — drag the sliders and set a seed, or switch to the **AI** tab and
   enter a prompt. The viewport updates live.
3. **Check the contract** — the right-hand panel lists each rule (base on `Y=0`,
   centered, footprint, height, triangle budget, material). It must read
   **Contract satisfied** to export a mesh.
4. **Preview in context** — use the **field rotation** slider (with **Snap 15°** to
   match the bake cache) and the **Read check** toggle to confirm the silhouette
   reads at small zoom.
5. **Export** — choose a **variant slot**, then export. With the dev server
   running you can **write directly into the game's `assets/terrain/`**; otherwise
   the files download and a ready-made credits line is copied to your clipboard.

### The contract

Encoded in `src/contract/constants.ts` as the single source of truth (1 unit =
one hex circumradius, Y-up, `+Z` = north, base on `Y=0`):

| Type | Footprint (X×Z) | Height (Y) | Tris | Material |
|---|---|---|---|---|
| Hill | ≈ 1.8 units | ≈ 0.55 | ≤ 3000 | matte, ochre `#80592A` |
| Tower | ≈ 0.8 units | ≈ 1.5 | ≤ 3000 | matte, marble `#9A948A` |

Anything you generate is conformed toward these targets and then validated against
them.

### Export → game

Files use the game's naming convention (`hill_1.glb`, `tower_1.glb`,
`duststorm_1.png` + `.json`, …). Drop them into the game's `assets/terrain/`
(or let the editor write them there directly). The game discovers them
automatically — a model takes over for its terrain type, and with no model the
procedural prism/effect stays as the fallback. Open the game in the Godot editor
once after export so it imports the new files.

---

## How it works

```
src/
  contract/        # the rules: target sizes, palette, tri budget, validation
  artifacts/       # one generator per type (hill, tower, duststorm) + registry
  generation/      # procedural engine (seeded RNG), conform pipeline, AI provider
  viewport/        # r3f canvas mirroring the game's isometric bake camera
  ui/              # param panel, validation panel, export panel, AI prompt tab
  export/          # glTF export, sprite-sheet export, presets, credits, save-to-game
```

The architecturally durable parts are the **registry** (param-schema-driven, so
the UI builds itself from each generator's spec), the **conform pipeline** (every
mesh — procedural or AI — passes through it), and the **contract** (engine- and
source-agnostic data). New artifact types, more variants, additional export
formats, and batch generation all extend this without rework.

### Adding an artifact type

1. Create `src/artifacts/<name>.ts` exporting an `ArtifactDef` (a `category`, a
   param schema, and a deterministic `generate(seed, params)` function).
2. Add it to `ARTIFACTS` in `src/artifacts/registry.ts`.

It appears under the right category tab automatically, with its param panel,
validation, preview, and export wired up.

---

## Roadmap

- Native macOS app via Tauri (replaces the dev-server write endpoint with native
  filesystem access + a folder picker). Approach is captured in
  [`TODO_TAURI.md`](TODO_TAURI.md).
- More artifact types and variants; batch variant generation; richer export
  (e.g. glTF-transform optimization).

## Tech

[Vite](https://vitejs.dev/) · [React](https://react.dev/) · TypeScript ·
[Three.js](https://threejs.org/) with
[react-three-fiber](https://github.com/pmndrs/react-three-fiber) +
[drei](https://github.com/pmndrs/drei) · glTF export via
[three-stdlib](https://github.com/pmndrs/three-stdlib).

## License

No license file yet — add a `LICENSE` before publishing if you intend others to
reuse this.
