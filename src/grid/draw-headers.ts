/**
 * Row / column header strip and frozen-pane separators.
 */

import { colToLetters } from '../engine/address';
import { HEADER_H, HEADER_W } from './layout';
import type { DrawCtx } from './theme';
import { containsCell } from './selection';

export function drawHeaders(d: DrawCtx): void {
  const { ctx, sheet, visible, viewport, selection, theme } = d;
  ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Column header strip
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(HEADER_W, 0, viewport.width - HEADER_W, HEADER_H);
  let x = HEADER_W + visible.offsetX;
  for (let col = visible.startCol; col <= visible.endCol; col++) {
    const w = sheet.colWidth(col);
    const highlight =
      containsCell(selection, { row: selection.active.row, col }) ||
      selection.active.col === col;
    if (highlight) {
      ctx.fillStyle = theme.headerActiveBg;
      ctx.fillRect(x, 0, w, HEADER_H);
    }
    ctx.strokeStyle = theme.headerBorder;
    ctx.beginPath();
    ctx.moveTo(x + w + 0.5, 0);
    ctx.lineTo(x + w + 0.5, HEADER_H);
    ctx.stroke();
    ctx.fillStyle = theme.headerText;
    ctx.fillText(colToLetters(col), x + w / 2, HEADER_H / 2);
    x += w;
  }
  ctx.strokeStyle = theme.headerBorder;
  ctx.beginPath();
  ctx.moveTo(HEADER_W, HEADER_H + 0.5);
  ctx.lineTo(viewport.width, HEADER_H + 0.5);
  ctx.stroke();

  // Row header strip
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, HEADER_H, HEADER_W, viewport.height - HEADER_H);
  let y = HEADER_H + visible.offsetY;
  for (let row = visible.startRow; row <= visible.endRow; row++) {
    const h = sheet.rowHeight(row);
    const highlight =
      containsCell(selection, { row, col: selection.active.col }) ||
      selection.active.row === row;
    if (highlight) {
      ctx.fillStyle = theme.headerActiveBg;
      ctx.fillRect(0, y, HEADER_W, h);
    }
    ctx.strokeStyle = theme.headerBorder;
    ctx.beginPath();
    ctx.moveTo(0, y + h + 0.5);
    ctx.lineTo(HEADER_W, y + h + 0.5);
    ctx.stroke();
    ctx.fillStyle = theme.headerText;
    ctx.textAlign = 'center';
    ctx.fillText(String(row + 1), HEADER_W / 2, y + h / 2);
    y += h;
  }
  ctx.beginPath();
  ctx.moveTo(HEADER_W + 0.5, HEADER_H);
  ctx.lineTo(HEADER_W + 0.5, viewport.height);
  ctx.stroke();

  // Corner cap
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, HEADER_W, HEADER_H);
  ctx.strokeRect(0.5, 0.5, HEADER_W, HEADER_H);
}

export function drawFrozenLines(d: DrawCtx): void {
  const { ctx, sheet, visible, theme } = d;
  if (sheet.freeze.rows === 0 && sheet.freeze.cols === 0) return;
  ctx.save();
  ctx.strokeStyle = theme.frozenLine;
  ctx.lineWidth = 2;
  if (sheet.freeze.rows > 0) {
    const y = HEADER_H + visible.offsetY;
    let py = y;
    for (let r = visible.startRow; r < sheet.freeze.rows && r <= visible.endRow; r++) {
      py += sheet.rowHeight(r);
    }
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(d.viewport.width, py);
    ctx.stroke();
  }
  if (sheet.freeze.cols > 0) {
    const x = HEADER_W + visible.offsetX;
    let px = x;
    for (let c = visible.startCol; c < sheet.freeze.cols && c <= visible.endCol; c++) {
      px += sheet.colWidth(c);
    }
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, d.viewport.height);
    ctx.stroke();
  }
  ctx.restore();
}
