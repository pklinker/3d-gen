import type { Plugin } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";

// Dev-only endpoint that writes exported assets straight into the game repo's
// category-specific asset subdirectory and maintains assets/CREDITS.md.
// The game dir is configured via /api/settings (persisted to .3d-gen-settings.json)
// or falls back to GAME_DIR env / DEFAULT_GAME_DIR. Disabled in production
// builds — the editor falls back to browser download when /api/target is 404.

const DEFAULT_GAME_DIR = "/Users/paulklinker/src/flyers";
const SETTINGS_FILE = path.join(process.cwd(), ".3d-gen-settings.json");

const CATEGORY_DIRS: Record<string, string> = {
  buildings: "assets/buildings",
  ships: "assets/ships",
  effects: "assets/effects",
  terrain: "assets/terrain",
};

interface Settings {
  gameDir: string;
}

interface SaveFile {
  name: string;
  /** base64-encoded file contents */
  dataBase64: string;
}
interface SaveBody {
  files: SaveFile[];
  category?: string;
  /** prose CREDITS line bodies, keyed by filename */
  credits?: { file: string; note: string }[];
}

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw) as Settings;
  } catch {
    return { gameDir: process.env.GAME_DIR || DEFAULT_GAME_DIR };
  }
}

async function saveSettings(s: Settings): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function assetDir(gameDir: string, category: string): string {
  const sub = CATEGORY_DIRS[category] ?? "assets/terrain";
  return path.join(gameDir, sub);
}

function creditsPath(gameDir: string): string {
  return path.join(gameDir, "assets", "CREDITS.md");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Append lines under a category section in CREDITS.md, creating it if needed. */
async function updateCredits(
  gameDir: string,
  category: string,
  entries: { file: string; note: string }[],
): Promise<void> {
  const sub = CATEGORY_DIRS[category] ?? "assets/terrain";
  const heading = `## ${sub}/`;
  const cp = creditsPath(gameDir);
  let md = (await exists(cp)) ? await fs.readFile(cp, "utf8") : "# Asset credits\n";
  if (!md.includes(heading)) {
    md = md.trimEnd() + `\n\n${heading}\n`;
  }
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.trim() === heading);
  for (const e of entries) {
    const line = `- \`${e.file}\` — ${e.note}`;
    if (md.includes(`\`${e.file}\``)) continue;
    let insertAt = idx + 1;
    while (insertAt < lines.length && !lines[insertAt].startsWith("## ")) insertAt++;
    lines.splice(insertAt, 0, line);
  }
  await fs.writeFile(cp, lines.join("\n"));
}

export function saveFilesPlugin(): Plugin {
  return {
    name: "save-terrain-files",
    configureServer(server) {
      server.middlewares.use("/api/settings", (req, res) => {
        if (req.method === "GET") {
          void loadSettings().then((s) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(s));
          });
          return;
        }
        if (req.method === "POST") {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", async () => {
            try {
              const body = JSON.parse(raw) as Partial<Settings>;
              const current = await loadSettings();
              const updated: Settings = { ...current, ...body };
              await saveSettings(updated);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, settings: updated }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end("GET/POST only");
      });

      server.middlewares.use("/api/target", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        void loadSettings().then(async (s) => {
          const ok = await exists(s.gameDir);
          res.end(JSON.stringify({ gameDir: s.gameDir, reachable: ok }));
        });
      });

      server.middlewares.use("/api/save", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            const body = JSON.parse(raw) as SaveBody;
            const { gameDir } = await loadSettings();
            const category = body.category ?? "terrain";
            const dir = assetDir(gameDir, category);
            await fs.mkdir(dir, { recursive: true });
            const written: string[] = [];
            for (const f of body.files) {
              const safe = path.basename(f.name);
              await fs.writeFile(path.join(dir, safe), Buffer.from(f.dataBase64, "base64"));
              written.push(safe);
            }
            if (body.credits?.length) await updateCredits(gameDir, category, body.credits);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, dir, written }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
          }
        });
      });
    },
  };
}
