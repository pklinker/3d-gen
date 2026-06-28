import type { Plugin } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";

// Dev-only endpoint that writes exported assets straight into the game repo's
// assets/terrain/ and maintains assets/CREDITS.md. The game dir is taken from
// GAME_DIR (env) or defaults to the known local path. Disabled in production
// builds — the editor falls back to browser download when /api/target is 404.

const DEFAULT_GAME_DIR = "/Users/paulklinker/src/flyers";

interface SaveFile {
  name: string;
  /** base64-encoded file contents */
  dataBase64: string;
}
interface SaveBody {
  files: SaveFile[];
  /** prose CREDITS line bodies, keyed by filename, for the ## terrain/ section */
  credits?: { file: string; note: string }[];
}

function gameDir(): string {
  return process.env.GAME_DIR || DEFAULT_GAME_DIR;
}
function terrainDir(): string {
  return path.join(gameDir(), "assets", "terrain");
}
function creditsPath(): string {
  return path.join(gameDir(), "assets", "CREDITS.md");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Append lines under a `## terrain/` section in CREDITS.md, creating it if needed. */
async function updateCredits(entries: { file: string; note: string }[]): Promise<void> {
  const cp = creditsPath();
  let md = (await exists(cp)) ? await fs.readFile(cp, "utf8") : "# Asset credits\n";
  const heading = "## terrain/";
  if (!md.includes(heading)) {
    md = md.trimEnd() + `\n\n${heading}\n`;
  }
  // Insert each line after the heading, skipping files already credited.
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.trim() === heading);
  for (const e of entries) {
    const line = `- \`${e.file}\` — ${e.note}`;
    if (md.includes(`\`${e.file}\``)) continue; // already credited
    // find end of this section (next blank-then-heading or EOF) to append within it
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
      server.middlewares.use("/api/target", (req, res) => {
        const dir = terrainDir();
        res.setHeader("Content-Type", "application/json");
        void exists(gameDir()).then((ok) => {
          res.end(JSON.stringify({ gameDir: gameDir(), terrainDir: dir, reachable: ok }));
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
            const dir = terrainDir();
            await fs.mkdir(dir, { recursive: true });
            const written: string[] = [];
            for (const f of body.files) {
              const safe = path.basename(f.name); // no path traversal
              await fs.writeFile(path.join(dir, safe), Buffer.from(f.dataBase64, "base64"));
              written.push(safe);
            }
            if (body.credits?.length) await updateCredits(body.credits);
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
