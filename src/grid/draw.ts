/**
 * Canvas painting orchestrator. Lays out the paint order:
 *   background -> cells -> selection -> headers -> frozen lines
 * Delegates each layer to a focused module. Keep this file small.
 */

import type { Sheet } from '../engine/sheet';
import type { VisibleRange } from './layout';
import { HEADER_H, HEADER_W } from './layout';
import { allRanges } from './selection';
import { drawCells } from './draw-cells';
import { drawHeaders, drawFrozenLines } from './draw-headers';
import { drawTableFills, drawTableOutlines } from './draw-tables';
import type { DrawCtx } from './theme';
import { LIGHT_THEME } from './theme';
import type { RangeAddress } from '../engine/address';

export { LIGHT_THEME, DARK_THEME, HIGH_CONTRAST_THEME, THEMES } from './theme';
export type { DrawCtx, Theme, ThemeId } from './theme';

export function drawGrid(d: DrawCtx): void {
  const { ctx, viewport, theme } = d;
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  drawTableFills(d);
  drawCells(d);
  drawTableOutlines(d);
  drawSelection(d);
  drawHeaders(d);
  drawFrozenLines(d);
  ctx.restore();
}

function drawSelection(d: DrawCtx): void {
  const { ctx, sheet, visible, selection, theme, viewport, fillPreview, refPick } = d;
  ctx.save();
  ctx.beginPath();
  ctx.rect(HEADER_W, HEADER_H, viewport.width - HEADER_W, viewport.height - HEADER_H);
  ctx.clip();

  const ranges = allRanges(selection);
  ctx.fillStyle = theme.selFill;
  for (const r of ranges) {
    const rect = cellRect(sheet, visible, r.start.row, r.start.col, r.end.row, r.end.col);
    if (!rect) continue;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  const primaryStart = selection.primary.anchor;
  const primaryEnd = selection.primary.end;
  const primRect = cellRect(
    sheet,
    visible,
    Math.min(primaryStart.row, primaryEnd.row),
    Math.min(primaryStart.col, primaryEnd.col),
    Math.max(primaryStart.row, primaryEnd.row),
    Math.max(primaryStart.col, primaryEnd.col),
  );
  if (primRect) {
    ctx.strokeStyle = theme.selBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(primRect.x + 1, primRect.y + 1, primRect.w - 2, primRect.h - 2);
  }
  const active = selection.active;
  const activeRect = cellRect(sheet, visible, active.row, active.col, active.row, active.col);
  if (activeRect) {
    ctx.strokeStyle = theme.selBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(activeRect.x + 1, activeRect.y + 1, activeRect.w - 2, activeRect.h - 2);
  }

  // Fill-handle preview: dashed outline over the destination area while the
  // user drags the bottom-right square of the selection.
  if (fillPreview) {
    const fp = fillPreview;
    const r = cellRect(sheet, visible, fp.start.row, fp.start.col, fp.end.row, fp.end.col);
    if (r) {
      ctx.save();
      ctx.strokeStyle = theme.selBorder;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.restore();
    }
  }

  // Range-picker preview: marching-ant outline over the cells the user is
  // dragging into the formula editor.
  if (refPick) {
    const rect = cellRect(
      sheet,
      visible,
      Math.min(refPick.start.row, refPick.end.row),
      Math.min(refPick.start.col, refPick.end.col),
      Math.max(refPick.start.row, refPick.end.row),
      Math.max(refPick.start.col, refPick.end.col),
    );
    if (rect) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.75;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      ctx.restore();
    }
  }

  // Fill-handle anchor (small filled square at the bottom-right corner of the
  // primary selection). Drawn after dashed previews so it stays on top.
  if (primRect) {
    const size = 6;
    ctx.fillStyle = theme.selBorder;
    ctx.fillRect(primRect.x + primRect.w - size, primRect.y + primRect.h - size, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(primRect.x + primRect.w - size + 0.5, primRect.y + primRect.h - size + 0.5, size - 1, size - 1);
  }

  ctx.restore();
}

/** Pixel rect of the fill handle (relative to the canvas). Returns undefined when off-screen. */
export function fillHandleRect(
  sheet: Sheet,
  visible: VisibleRange,
  primary: RangeAddress,
): { x: number; y: number; w: number; h: number } | undefined {
  const r = cellRect(
    sheet,
    visible,
    Math.min(primary.start.row, primary.end.row),
    Math.min(primary.start.col, primary.end.col),
    Math.max(primary.start.row, primary.end.row),
    Math.max(primary.start.col, primary.end.col),
  );
  if (!r) return undefined;
  const size = 8; // a hair larger than the visual square so the hit target is generous
  return { x: r.x + r.w - size, y: r.y + r.h - size, w: size, h: size };
}

export function cellRect(
  sheet: Sheet,
  visible: VisibleRange,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): { x: number; y: number; w: number; h: number } | undefined {
  if (r1 < visible.startRow || r0 > visible.endRow) return undefined;
  if (c1 < visible.startCol || c0 > visible.endCol) return undefined;
  let x = HEADER_W + visible.offsetX;
  for (let c = visible.startCol; c < c0; c++) x += sheet.colWidth(c);
  let w = 0;
  for (let c = Math.max(c0, visible.startCol); c <= Math.min(c1, visible.endCol); c++) {
    w += sheet.colWidth(c);
  }
  let y = HEADER_H + visible.offsetY;
  for (let r = visible.startRow; r < r0; r++) y += sheet.rowHeight(r);
  let h = 0;
  for (let r = Math.max(r0, visible.startRow); r <= Math.min(r1, visible.endRow); r++) {
    h += sheet.rowHeight(r);
  }
  return { x, y, w, h };
}

// Re-export default theme so older imports keep working.
export { LIGHT_THEME as THEME };
