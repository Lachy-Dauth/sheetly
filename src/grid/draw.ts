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
  const { ctx, sheet, visible, selection, theme, viewport } = d;
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
  ctx.restore();
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
