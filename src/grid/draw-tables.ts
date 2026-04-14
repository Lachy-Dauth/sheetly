/**
 * Draw table chrome over the grid: header fill, banded rows, filter pills.
 * Split into a fill pass (before cells) and an outline pass (after cells)
 * so per-cell gridlines don't paint over the table border.
 */

import { dataRange } from '../engine/tables';
import { cellRect } from './draw';
import type { DrawCtx } from './theme';

export function drawTableFills(d: DrawCtx): void {
  const { ctx, sheet, workbook, visible } = d;
  const tables = workbook.tables.listForSheet(sheet.id);
  if (tables.length === 0) return;
  ctx.save();
  for (const t of tables) {
    if (t.style.bandedRows && t.style.bandFill) {
      const data = dataRange(t);
      for (let r = data.startRow; r <= data.endRow; r++) {
        if (((r - data.startRow) & 1) === 0) continue;
        const rect = cellRect(sheet, visible, r, t.range.start.col, r, t.range.end.col);
        if (!rect) continue;
        ctx.fillStyle = t.style.bandFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
    if (t.headerRow && t.style.headerFill) {
      const rect = cellRect(
        sheet,
        visible,
        t.range.start.row,
        t.range.start.col,
        t.range.start.row,
        t.range.end.col,
      );
      if (rect) {
        ctx.fillStyle = t.style.headerFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
  }
  ctx.restore();
}

export function drawTableOutlines(d: DrawCtx): void {
  const { ctx, sheet, workbook, visible } = d;
  const tables = workbook.tables.listForSheet(sheet.id);
  if (tables.length === 0) return;
  ctx.save();
  for (const t of tables) {
    const rect = cellRect(
      sheet,
      visible,
      t.range.start.row,
      t.range.start.col,
      t.range.end.row,
      t.range.end.col,
    );
    if (!rect) continue;
    ctx.strokeStyle = t.style.headerFill ?? '#1f6feb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    // Filter chevrons on each header column (visual only).
    if (t.headerRow) {
      for (let c = t.range.start.col; c <= t.range.end.col; c++) {
        const h = cellRect(sheet, visible, t.range.start.row, c, t.range.start.row, c);
        if (!h) continue;
        const cx = h.x + h.w - 10;
        const cy = h.y + h.h / 2;
        ctx.fillStyle = t.style.headerColor ?? '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 2);
        ctx.lineTo(cx + 4, cy - 2);
        ctx.lineTo(cx, cy + 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
