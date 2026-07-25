import type { MapCell } from "./types";

/** Apply one click at (q, r) with the given brush to a cell list, returning a
 *  new array (never mutates the input — React state stays predictable).
 *
 *  brush === null is the Eraser: removes whatever's at (q, r), if anything.
 *  brush === a kind id: paints that kind there — UNLESS the cell already holds
 *  that exact kind, in which case the click erases it (a same-kind click is a
 *  toggle, so there's no separate "erase this one cell" gesture to learn). */
export function applyPaint(cells: MapCell[], q: number, r: number, brush: string | null): MapCell[] {
  const idx = cells.findIndex((c) => c.q === q && c.r === r);
  if (brush === null) {
    return idx === -1 ? cells : cells.filter((_, i) => i !== idx);
  }
  if (idx !== -1 && cells[idx].kind === brush) {
    return cells.filter((_, i) => i !== idx); // same-kind click toggles off
  }
  const next = [...cells];
  const painted = { q, r, kind: brush };
  if (idx === -1) next.push(painted);
  else next[idx] = painted;
  return next;
}

/** Force-paint (q, r) to `kind`, no toggle — used for every cell after the
 *  first in a brush-drag stroke, where re-entering an already-painted cell of
 *  the stroke's own kind must stay painted rather than flicker off. */
export function setCell(cells: MapCell[], q: number, r: number, kind: string): MapCell[] {
  const idx = cells.findIndex((c) => c.q === q && c.r === r);
  if (idx !== -1 && cells[idx].kind === kind) return cells;
  const painted = { q, r, kind };
  if (idx === -1) return [...cells, painted];
  const next = [...cells];
  next[idx] = painted;
  return next;
}

/** Unconditionally remove whatever's at (q, r), if anything — the drag-stroke
 *  counterpart of the Eraser brush, and of an erase-stroke started by
 *  clicking a same-kind cell (applyPaint's toggle). */
export function eraseCell(cells: MapCell[], q: number, r: number): MapCell[] {
  const idx = cells.findIndex((c) => c.q === q && c.r === r);
  return idx === -1 ? cells : cells.filter((_, i) => i !== idx);
}
