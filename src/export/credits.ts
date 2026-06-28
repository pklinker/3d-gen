/** Build a single assets/CREDITS.md line for an exported asset (download path). */
export function creditsLine(opts: {
  filename: string;
  source: string; // "procedural" or an AI provider name
  seed?: number;
}): string {
  return `- \`${opts.filename}\` — ${creditsNote(opts.source, opts.seed)}`;
}

/**
 * The note body (without the `- \`file\` —` prefix), in the game's prose CREDITS
 * style. The dev-server plugin prepends the filename when writing the game file.
 */
export function creditsNote(source: string, seed?: number): string {
  const seedTxt = seed != null ? ` (3d-gen editor, seed ${seed})` : " (3d-gen editor)";
  if (source === "procedural") {
    return `procedurally generated low-poly terrain${seedTxt}. Own work, CC0.`;
  }
  return `AI-generated via ${source}, conformed to the §4b contract${seedTxt}. Verify license before shipping.`;
}
