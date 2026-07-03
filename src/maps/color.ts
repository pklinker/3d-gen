/** "#rrggbb" -> [r, g, b, a] floats in 0..1, alpha always 1 (this editor has no
 *  UI for authoring an alpha channel — a kind's color is fully opaque unless a
 *  data file crafted by hand sets otherwise). Shared by KindForm (manual color
 *  picker) and autoKind (deriving a kind's color from an artifact's own
 *  MESH_CONTRACTS/effect-default color). */
export function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1,
  ];
}

function toHexByte(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
}

/** Inverse of hexToRgba (alpha dropped — an <input type="color"> has no alpha
 *  channel). Lets KindForm's color picker reflect a derived doc's own color
 *  when the user picks a generator, instead of staying at a generic default. */
export function rgbaToHex([r, g, b]: [number, number, number, number]): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}
