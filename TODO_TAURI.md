# TODO — Package the editor as a native Mac app (Tauri)

Deferred. Captures the agreed approach so we can pick it up later. The editor today
is a Vite + React + Three.js web app that writes assets into the game via a **dev-only**
Vite endpoint (`/api/save`, `/api/target` in `vite-plugin-savefiles.ts`). Packaging
replaces that dev endpoint with native filesystem access and produces a distributable
`.app` / `.dmg`.

## Why Tauri (vs Electron)

- **Tauri** — Rust shell + system WebView (WKWebView). Tiny binary (~5–10 MB), native FS,
  WebGL/Three.js run fine. **Recommended.**
- **Electron** — bundles Chromium (~150 MB) but gives full in-process Node.js. Only pick
  this if the app must *shell out* (e.g. auto-run Godot's `.glb` import, or invoke Blender
  headless / `xatlas` for heavier features). Not needed for current scope.

The frontend is unchanged either way — only the IO layer differs.

## Key insight: the migration is small

The write-path is already isolated behind one module: `src/export/saveToGame.ts`
(`getTarget()` + `saveToGame()`, both currently `fetch('/api/...')`). Swapping the
transport touches essentially that one file. Do it behind an interface so the web build
and the native build can coexist.

## Steps

1. **Abstract the IO layer.**
   - Define an interface (e.g. `AssetSink` with `getTarget()` and `save(files, credits)`).
   - Implement two backends:
     - `httpSink` — current `fetch('/api/save')` (keeps `npm run dev` working in a browser).
     - `tauriSink` — calls Tauri commands via `@tauri-apps/api`'s `invoke(...)`.
   - Pick the backend at runtime: use `tauriSink` when `window.__TAURI__` is present, else `httpSink`.
   - `ExportPanel.tsx` and the rest of the UI stay as-is (they already depend only on `saveToGame.ts`).

2. **Add Tauri to the project.**
   - `npm create tauri-app` / `npm i -D @tauri-apps/cli` + `@tauri-apps/api`.
   - Point `tauri.conf.json` `build.devUrl` at the Vite dev server (port 5180) and
     `frontendDist` at `dist/`. `beforeBuildCommand: "npm run build"`.

3. **Rust commands (replace the Vite plugin logic).**
   - `get_target() -> { gameDir, terrainDir, reachable }` — mirror `vite-plugin-savefiles.ts`.
   - `save_terrain(files: Vec<{name, data_base64}>, credits: Vec<{file, note}>)` — write into
     the chosen terrain dir, `mkdir -p`, update `assets/CREDITS.md` (port `updateCredits`).
   - Reuse the exact path/credits logic already written in `vite-plugin-savefiles.ts`.

4. **Native folder picker (improvement over the hardcoded path).**
   - Use the Tauri dialog plugin to let the user choose the game repo once; persist it in
     app config (Tauri store / a small JSON in app data dir). Replaces `DEFAULT_GAME_DIR`.
   - Show the chosen path in `ExportPanel` (the UI field already exists).

5. **AI keys (move off `VITE_` env).**
   - `VITE_*` env bakes keys into the client bundle — fine for local dev, not for a shipped
     app. Store keys in native config / secure storage; expose to the frontend via a Tauri
     command (`get_ai_key`) instead of `import.meta.env`.
   - Update `src/generation/aiProvider.ts` `activeProvider()` accordingly.

6. **Filesystem scope / permissions.**
   - Grant fs access to the selected game directory via Tauri's capability/permission config
     (scoped to the picked folder, not broad).

7. **Build, sign, notarize.**
   - `npm run tauri build` → `.app` + `.dmg`.
   - Apple Developer cert: codesign + `notarytool` submit + staple for Gatekeeper.

## Optional bonus once native

- Write to **any** game dir via the folder picker (already covered above).
- The Vite dev-server requirement disappears for end users.
- (Electron-only) auto-trigger Godot import after export by shelling to the Godot binary.

## Checklist

- [ ] Extract `AssetSink` interface; add `httpSink` + `tauriSink`; runtime-select.
- [ ] Add Tauri scaffolding + `tauri.conf.json` (devUrl 5180, dist).
- [ ] Port `get_target` / `save_terrain` / `updateCredits` to Rust.
- [ ] Folder picker + persisted game-dir config; surface in `ExportPanel`.
- [ ] Move AI keys to native config; update `aiProvider.ts`.
- [ ] Scope fs permissions to the chosen folder.
- [ ] `tauri build`, codesign, notarize, staple → `.dmg`.

## Files involved

- `src/export/saveToGame.ts` — swap transport (main change).
- `vite-plugin-savefiles.ts` — source of truth for path + credits logic to port to Rust.
- `src/generation/aiProvider.ts` — AI key source.
- `src/ui/ExportPanel.tsx` — already wired to the IO module; minimal/no change.
- New: `src-tauri/` (Rust commands, `tauri.conf.json`, capabilities).
