/**
 * Canvas painting: headers, gridlines, cell text, selection overlay.
 * Pure drawing: takes a context and the computed visible range, writes pixels,
 * no React or DOM beyond the canvas.
 */

import type { Sheet } from '../engine/sheet';
import type { Workbook } from '../engine/workbook';
import { colToLetters } from '../engine/address';
import type { Style } from '../engine/styles';
import { formatValue } from './format';
import { HEADER_H, HEADER_W } from './layout';
import type { VisibleRange, ViewportRect } from './layout';
import type { Selection } from './selection';
import { allRanges, containsCell } from './selection';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  workbook: Workbook;
  sheet: Sheet;
  viewport: ViewportRect;
  visible: VisibleRange;
  selection: Selection;
  dpr: number;
}

const THEME = {
  bg: '#ffffff',
  gridline: '#e1e5ea',
  headerBg: '#eef0f4',
  headerText: '#3a3f46',
  headerBorder: '#c8ccd2',
  headerActiveBg: '#ddeaff',
  selBorder: '#1f6feb',
  selFill: 'rgba(31, 111, 235, 0.10)',
  activeBg: '#ffffff',
  text: '#1f2328',
  frozenLine: '#999da3',
};

export function drawGrid(d: DrawCtx): void {
  const { ctx, viewport } = d;
  ctx.save();
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  drawCells(d);
  drawSelection(d);
  drawHeaders(d);
  drawFrozenLines(d);
  ctx.restore();
}

function drawCells(d: DrawCtx): void {
  const { ctx, sheet, visible, workbook } = d;
  ctx.save();
  ctx.beginPath();
  ctx.rect(HEADER_W, HEADER_H, d.viewport.width - HEADER_W, d.viewport.height - HEADER_H);
  ctx.clip();

  ctx.strokeStyle = THEME.gridline;
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  let y = HEADER_H + visible.offsetY;
  for (let row = visible.startRow; row <= visible.endRow; row++) {
    const h = sheet.rowHeight(row);
    let x = HEADER_W + visible.offsetX;
    for (let col = visible.startCol; col <= visible.endCol; col++) {
      const w = sheet.colWidth(col);
      const cell = sheet.getCell({ row, col });
      const style: Style | undefined =
        cell?.styleId !== undefined ? workbook.styles.get(cell.styleId) : undefined;
      if (style?.fill) {
        ctx.fillStyle = style.fill;
        ctx.fillRect(x, y, w, h);
      }

      // Gridlines (cell bottom + right).
      ctx.strokeStyle = THEME.gridline;
      ctx.beginPath();
      ctx.moveTo(x, y + h + 0.5);
      ctx.lineTo(x + w, y + h + 0.5);
      ctx.moveTo(x + w + 0.5, y);
      ctx.lineTo(x + w + 0.5, y + h);
      ctx.stroke();

      if (cell) {
        drawCellText(d, cell, style, x, y, w, h);
      }
      x += w;
    }
    y += h;
  }
  ctx.restore();
}

function drawCellText(
  d: DrawCtx,
  cell: ReturnType<Sheet['getCell']>,
  style: Style | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const { ctx } = d;
  if (!cell) return;
  const raw = cell.computed ?? cell.value ?? (typeof cell.raw === 'string' ? cell.raw : cell.raw);
  const text = formatValue(raw ?? null, style?.format ?? cell.format);
  if (!text) return;
  const weight = style?.bold ? 'bold' : 'normal';
  const italic = style?.italic ? 'italic' : 'normal';
  const size = style?.fontSize ?? 12;
  ctx.font = `${italic} ${weight} ${size}px ${style?.font ?? '-apple-system, "Segoe UI", sans-serif'}`;
  ctx.fillStyle = style?.color ?? THEME.text;
  const padding = 4;
  const isNumeric = typeof raw === 'number';
  const align: CanvasTextAlign =
    style?.align === 'center' ? 'center' : style?.align === 'right' ? 'right' : isNumeric ? 'right' : 'left';
  ctx.textAlign = align;
  const ty = y + h / 2;
  let tx: number;
  if (align === 'right') tx = x + w - padding;
  else if (align === 'center') tx = x + w / 2;
  else tx = x + padding;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();
  ctx.fillText(text, tx, ty);
  if (style?.underline) {
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const startX = align === 'right' ? tx - width : align === 'center' ? tx - width / 2 : tx;
    ctx.beginPath();
    ctx.moveTo(startX, ty + size / 2);
    ctx.lineTo(startX + width, ty + size / 2);
    ctx.strokeStyle = style.color ?? THEME.text;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelection(d: DrawCtx): void {
  const { ctx, sheet, visible, selection } = d;
  ctx.save();
  ctx.beginPath();
  ctx.rect(HEADER_W, HEADER_H, d.viewport.width - HEADER_W, d.viewport.height - HEADER_H);
  ctx.clip();

  const ranges = allRanges(selection);
  ctx.fillStyle = THEME.selFill;
  for (const r of ranges) {
    const rect = cellRect(sheet, visible, r.start.row, r.start.col, r.end.row, r.end.col);
    if (!rect) continue;
    // Skip the filling behind the active cell — leaves it visibly distinct.
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // Active cell outline (double-width line for primary range).
  const active = selection.active;
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
    ctx.strokeStyle = THEME.selBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(primRect.x + 1, primRect.y + 1, primRect.w - 2, primRect.h - 2);
  }
  // Active cell (thin inner box).
  const activeRect = cellRect(sheet, visible, active.row, active.col, active.row, active.col);
  if (activeRect) {
    ctx.strokeStyle = THEME.selBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(activeRect.x + 1, activeRect.y + 1, activeRect.w - 2, activeRect.h - 2);
  }
  ctx.restore();
}

function drawHeaders(d: DrawCtx): void {
  const { ctx, sheet, visible, viewport, selection } = d;
  ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Column headers.
  ctx.fillStyle = THEME.headerBg;
  ctx.fillRect(HEADER_W, 0, viewport.width - HEADER_W, HEADER_H);
  ctx.fillStyle = THEME.headerText;
  let x = HEADER_W + visible.offsetX;
  for (let col = visible.startCol; col <= visible.endCol; col++) {
    const w = sheet.colWidth(col);
    const highlight =
      containsCell(selection, { row: selection.active.row, col }) || selection.active.col === col;
    if (highlight) {
      ctx.fillStyle = THEME.headerActiveBg;
      ctx.fillRect(x, 0, w, HEADER_H);
    }
    ctx.strokeStyle = THEME.headerBorder;
    ctx.beginPath();
    ctx.moveTo(x + w + 0.5, 0);
    ctx.lineTo(x + w + 0.5, HEADER_H);
    ctx.stroke();
    ctx.fillStyle = THEME.headerText;
    ctx.fillText(colToLetters(col), x + w / 2, HEADER_H / 2);
    x += w;
  }
  ctx.strokeStyle = THEME.headerBorder;
  ctx.beginPath();
  ctx.moveTo(HEADER_W, HEADER_H + 0.5);
  ctx.lineTo(viewport.width, HEADER_H + 0.5);
  ctx.stroke();

  // Row headers.
  ctx.fillStyle = THEME.headerBg;
  ctx.fillRect(0, HEADER_H, HEADER_W, viewport.height - HEADER_H);
  let y = HEADER_H + visible.offsetY;
  for (let row = visible.startRow; row <= visible.endRow; row++) {
    const h = sheet.rowHeight(row);
    const highlight =
      containsCell(selection, { row, col: selection.active.col }) || selection.active.row === row;
    if (highlight) {
      ctx.fillStyle = THEME.headerActiveBg;
      ctx.fillRect(0, y, HEADER_W, h);
    }
    ctx.strokeStyle = THEME.headerBorder;
    ctx.beginPath();
    ctx.moveTo(0, y + h + 0.5);
    ctx.lineTo(HEADER_W, y + h + 0.5);
    ctx.stroke();
    ctx.fillStyle = THEME.headerText;
    ctx.textAlign = 'center';
    ctx.fillText(String(row + 1), HEADER_W / 2, y + h / 2);
    y += h;
  }
  ctx.beginPath();
  ctx.moveTo(HEADER_W + 0.5, HEADER_H);
  ctx.lineTo(HEADER_W + 0.5, viewport.height);
  ctx.stroke();

  // Corner box.
  ctx.fillStyle = THEME.headerBg;
  ctx.fillRect(0, 0, HEADER_W, HEADER_H);
  ctx.strokeRect(0.5, 0.5, HEADER_W, HEADER_H);
}

function drawFrozenLines(d: DrawCtx): void {
  const { ctx, sheet, visible } = d;
  if (sheet.freeze.rows === 0 && sheet.freeze.cols === 0) return;
  ctx.save();
  ctx.strokeStyle = THEME.frozenLine;
  ctx.lineWidth = 2;
  if (sheet.freeze.rows > 0) {
    const y = HEADER_H + visible.offsetY;
    let py = y;
    for (let r = visible.startRow; r < sheet.freeze.rows && r <= visible.endRow; r++)
      py += sheet.rowHeight(r);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(d.viewport.width, py);
    ctx.stroke();
  }
  if (sheet.freeze.cols > 0) {
    const x = HEADER_W + visible.offsetX;
    let px = x;
    for (let c = visible.startCol; c < sheet.freeze.cols && c <= visible.endCol; c++)
      px += sheet.colWidth(c);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, d.viewport.height);
    ctx.stroke();
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
