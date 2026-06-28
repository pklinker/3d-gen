import type { GeneratedEffect } from "../types";

export interface EffectExport {
  png: Blob;
  json: string;
  columns: number;
  rows: number;
}

/**
 * Render an effect to a sprite-sheet PNG (grid of frames) plus a params JSON
 * the game can read to play it back (frame size, count, fps hint, layout).
 */
export async function exportEffect(
  effect: GeneratedEffect,
  meta: { type: string; seed: number; params: Record<string, unknown>; fps?: number },
): Promise<EffectExport> {
  const { frameCount, frameSize, drawFrame } = effect;
  const columns = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / columns);

  const sheet = document.createElement("canvas");
  sheet.width = columns * frameSize;
  sheet.height = rows * frameSize;
  const sctx = sheet.getContext("2d")!;

  const frame = document.createElement("canvas");
  frame.width = frameSize;
  frame.height = frameSize;
  const fctx = frame.getContext("2d")!;

  for (let i = 0; i < frameCount; i++) {
    fctx.clearRect(0, 0, frameSize, frameSize);
    drawFrame(fctx, i, frameSize);
    const col = i % columns;
    const row = Math.floor(i / columns);
    sctx.drawImage(frame, col * frameSize, row * frameSize);
  }

  const png: Blob = await new Promise((resolve) =>
    sheet.toBlob((b) => resolve(b!), "image/png"),
  );

  const json = JSON.stringify(
    {
      type: meta.type,
      seed: meta.seed,
      frameCount,
      frameSize,
      columns,
      rows,
      fps: meta.fps ?? 24,
      loop: true,
      params: meta.params,
    },
    null,
    2,
  );

  return { png, json, columns, rows };
}
