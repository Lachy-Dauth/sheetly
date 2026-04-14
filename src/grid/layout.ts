/**
 * Layout helpers for the virtualised grid. All coordinates are in CSS pixels.
 * Column/row positions are computed on demand from the Sheet metadata with a
 * small running prefix-sum cache that invalidates on resize.
 */

import { DEFAULT_HEADER_HEIGHT, DEFAULT_HEADER_WIDTH } from '../engine/sheet';
import type { Sheet } from '../engine/sheet';

export const HEADER_W = DEFAULT_HEADER_WIDTH;
export const HEADER_H = DEFAULT_HEADER_HEIGHT;

export interface ViewportRect {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

export interface VisibleRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  offsetX: number; // pixel x of startCol relative to viewport (may be negative)
  offsetY: number; // pixel y of startRow relative to viewport (may be negative)
}

/** Find the column index covering `x` pixels from sheet origin, plus local offset. */
export function colAt(sheet: Sheet, x: number): { col: number; offset: number; endX: number } {
  let pos = 0;
  const max = Math.max(sheet.colCount, 1);
  for (let c = 0; c < max; c++) {
    const w = sheet.colWidth(c);
    if (pos + w > x) return { col: c, offset: x - pos, endX: pos + w };
    pos += w;
  }
  const last = max - 1;
  return { col: last, offset: x - (pos - sheet.colWidth(last)), endX: pos };
}

export function rowAt(sheet: Sheet, y: number): { row: number; offset: number; endY: number } {
  let pos = 0;
  const max = Math.max(sheet.rowCount, 1);
  for (let r = 0; r < max; r++) {
    const h = sheet.rowHeight(r);
    if (pos + h > y) return { row: r, offset: y - pos, endY: pos + h };
    pos += h;
  }
  const last = max - 1;
  return { row: last, offset: y - (pos - sheet.rowHeight(last)), endY: pos };
}

export function columnX(sheet: Sheet, col: number): number {
  let x = 0;
  for (let c = 0; c < col; c++) x += sheet.colWidth(c);
  return x;
}

export function rowY(sheet: Sheet, row: number): number {
  let y = 0;
  for (let r = 0; r < row; r++) y += sheet.rowHeight(r);
  return y;
}

export function totalWidth(sheet: Sheet): number {
  let w = 0;
  const n = Math.max(sheet.colCount, 1);
  for (let c = 0; c < n; c++) w += sheet.colWidth(c);
  return w;
}

export function totalHeight(sheet: Sheet): number {
  let h = 0;
  const n = Math.max(sheet.rowCount, 1);
  for (let r = 0; r < n; r++) h += sheet.rowHeight(r);
  return h;
}

export function computeVisible(sheet: Sheet, vp: ViewportRect): VisibleRange {
  const scrollableW = Math.max(0, vp.width - HEADER_W);
  const scrollableH = Math.max(0, vp.height - HEADER_H);
  const first = colAt(sheet, vp.scrollX);
  const last = colAt(sheet, vp.scrollX + scrollableW);
  const firstR = rowAt(sheet, vp.scrollY);
  const lastR = rowAt(sheet, vp.scrollY + scrollableH);
  return {
    startCol: first.col,
    endCol: last.col,
    startRow: firstR.row,
    endRow: lastR.row,
    offsetX: -first.offset,
    offsetY: -firstR.offset,
  };
}
