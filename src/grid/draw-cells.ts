/**
 * Paint the cell body layer: fills, text (with wrap / vertical align), and
 * per-edge borders. Handles merged ranges by treating the anchor as a single
 * rectangle spanning multiple rows/columns.
 */

import type { Cell } from '../engine/cell';
import type { Sheet } from '../engine/sheet';
import type { BorderSide, Style } from '../engine/styles';
import type { Workbook } from '../engine/workbook';
import type { CfOverlay } from '../engine/conditional';
import { evaluateRules } from '../engine/conditional';
import { cellKey } from '../engine/address';
import { formatValue } from './format';
import type { DrawCtx } from './theme';
import { HEADER_H, HEADER_W } from './layout';

interface CellBox {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cell: Cell | undefined;
  style: Style | undefined;
  overlay?: CfOverlay;
  mergeEnd?: { row: number; col: number };
}

export function drawCells(d: DrawCtx): void {
  const { ctx, sheet, visible, workbook, viewport, theme } = d;
  ctx.save();
  ctx.beginPath();
  ctx.rect(HEADER_W, HEADER_H, viewport.width - HEADER_W, viewport.height - HEADER_H);
  ctx.clip();

  const cfOverlays = sheet.conditionalRules.length > 0 ? evaluateRules(sheet, workbook) : undefined;
  const boxes = collectVisibleBoxes(sheet, workbook, visible, cfOverlays);
  const mergedCovered = coveredByMerges(sheet);

  // Layer 1: gridlines for non-merged cells
  ctx.strokeStyle = theme.gridline;
  ctx.lineWidth = 1;
  drawGridlines(d, mergedCovered);

  // Layer 2: fills (CF fill wins over explicit fill for a cleaner preview)
  for (const b of boxes) {
    const fill = b.overlay?.fill ?? b.style?.fill;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.mergeEnd) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 0.5, b.h - 0.5);
    }
    if (b.overlay?.dataBar) {
      const pad = 2;
      const barW = Math.max(0, (b.w - pad * 2) * b.overlay.dataBar.fraction);
      ctx.fillStyle = b.overlay.dataBar.color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(b.x + pad, b.y + pad, barW, b.h - pad * 2);
      ctx.globalAlpha = 1;
    }
  }

  // Layer 3: text
  ctx.textBaseline = 'middle';
  for (const b of boxes) {
    if (!b.cell) continue;
    drawCellText(d, b);
  }

  // Layer 4: explicit borders
  for (const b of boxes) {
    if (!b.style?.border) continue;
    drawCellBorders(d, b);
  }

  ctx.restore();
}

function coveredByMerges(sheet: Sheet): Set<number> {
  const covered = new Set<number>();
  for (const m of sheet.merges) {
    const { start, end } = m.range;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        if (r === start.row && c === start.col) continue;
        covered.add(r * 16384 + c);
      }
    }
  }
  return covered;
}

function collectVisibleBoxes(
  sheet: Sheet,
  workbook: Workbook,
  visible: DrawCtx['visible'],
  overlays?: Map<number, CfOverlay>,
): CellBox[] {
  const boxes: CellBox[] = [];
  const covered = coveredByMerges(sheet);
  let y = HEADER_H + visible.offsetY;
  for (let row = visible.startRow; row <= visible.endRow; row++) {
    const h = sheet.rowHeight(row);
    let x = HEADER_W + visible.offsetX;
    for (let col = visible.startCol; col <= visible.endCol; col++) {
      const w = sheet.colWidth(col);
      const key = row * 16384 + col;
      if (covered.has(key)) {
        x += w;
        continue;
      }
      const merge = sheet.merges.find((m) => m.range.start.row === row && m.range.start.col === col);
      let cellW = w;
      let cellH = h;
      let mergeEnd: { row: number; col: number } | undefined;
      if (merge) {
        const { start, end } = merge.range;
        cellW = 0;
        for (let c = start.col; c <= end.col; c++) cellW += sheet.colWidth(c);
        cellH = 0;
        for (let r = start.row; r <= end.row; r++) cellH += sheet.rowHeight(r);
        mergeEnd = { row: end.row, col: end.col };
      }
      const cell = sheet.getCell({ row, col });
      const style =
        cell?.styleId !== undefined ? workbook.styles.get(cell.styleId) : undefined;
      const overlay = overlays?.get(cellKey(row, col));
      boxes.push({ row, col, x, y, w: cellW, h: cellH, cell, style, overlay, mergeEnd });
      x += w;
    }
    y += h;
  }
  return boxes;
}

function drawGridlines(d: DrawCtx, covered: Set<number>): void {
  const { ctx, sheet, visible } = d;
  ctx.beginPath();
  let y = HEADER_H + visible.offsetY;
  for (let row = visible.startRow; row <= visible.endRow; row++) {
    const h = sheet.rowHeight(row);
    let x = HEADER_W + visible.offsetX;
    for (let col = visible.startCol; col <= visible.endCol; col++) {
      const w = sheet.colWidth(col);
      const key = row * 16384 + col;
      if (!covered.has(key)) {
        ctx.moveTo(x, y + h + 0.5);
        ctx.lineTo(x + w, y + h + 0.5);
        ctx.moveTo(x + w + 0.5, y);
        ctx.lineTo(x + w + 0.5, y + h);
      }
      x += w;
    }
    y += h;
  }
  ctx.stroke();
}

function drawCellText(d: DrawCtx, box: CellBox): void {
  const { ctx, theme } = d;
  const cell = box.cell!;
  const style = box.style;
  const overlay = box.overlay;
  const raw = cell.computed ?? cell.value ?? cell.raw;
  const text = formatValue(raw ?? null, style?.format ?? cell.format);
  if (!text) return;

  const size = style?.fontSize ?? 12;
  const bold = overlay?.bold ?? style?.bold;
  const italicOn = overlay?.italic ?? style?.italic;
  const weight = bold ? 'bold' : 'normal';
  const italic = italicOn ? 'italic' : 'normal';
  const family = style?.font ?? '-apple-system, "Segoe UI", sans-serif';
  ctx.font = `${italic} ${weight} ${size}px ${family}`;
  ctx.fillStyle = overlay?.color ?? style?.color ?? theme.text;

  const padding = 4;
  const isNumeric = typeof raw === 'number';
  const align: CanvasTextAlign =
    style?.align === 'center'
      ? 'center'
      : style?.align === 'right'
        ? 'right'
        : style?.align === 'left'
          ? 'left'
          : isNumeric
            ? 'right'
            : 'left';
  ctx.textAlign = align;

  const lineHeight = size * 1.2;
  const lines = style?.wrap
    ? wrapLines(ctx, text, box.w - padding * 2)
    : [text];

  const blockH = lines.length * lineHeight;
  const valign = style?.valign ?? (box.mergeEnd ? 'middle' : 'middle');
  let topY: number;
  if (valign === 'top') topY = box.y + padding + lineHeight / 2;
  else if (valign === 'bottom') topY = box.y + box.h - blockH + lineHeight / 2 - padding;
  else topY = box.y + box.h / 2 - blockH / 2 + lineHeight / 2;

  const indent = (style?.indent ?? 0) * 8;
  let tx: number;
  if (align === 'right') tx = box.x + box.w - padding - indent;
  else if (align === 'center') tx = box.x + box.w / 2;
  else tx = box.x + padding + indent;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  ctx.clip();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const ty = topY + i * lineHeight;
    ctx.fillText(line, tx, ty);
    const metrics = ctx.measureText(line);
    const width = metrics.width;
    const startX = align === 'right' ? tx - width : align === 'center' ? tx - width / 2 : tx;
    if (style?.underline) {
      ctx.beginPath();
      ctx.moveTo(startX, ty + size / 2);
      ctx.lineTo(startX + width, ty + size / 2);
      ctx.strokeStyle = style.color ?? theme.text;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (style?.strike) {
      ctx.beginPath();
      ctx.moveTo(startX, ty);
      ctx.lineTo(startX + width, ty);
      ctx.strokeStyle = style.color ?? theme.text;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/ /);
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        out.push(current);
        current = word;
      }
    }
    out.push(current);
  }
  return out;
}

function drawCellBorders(d: DrawCtx, box: CellBox): void {
  const { ctx } = d;
  const b = box.style?.border;
  if (!b) return;
  strokeBorder(ctx, b.top, box.x, box.y, box.x + box.w, box.y);
  strokeBorder(ctx, b.bottom, box.x, box.y + box.h, box.x + box.w, box.y + box.h);
  strokeBorder(ctx, b.left, box.x, box.y, box.x, box.y + box.h);
  strokeBorder(ctx, b.right, box.x + box.w, box.y, box.x + box.w, box.y + box.h);
}

function strokeBorder(
  ctx: CanvasRenderingContext2D,
  side: BorderSide | undefined,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  if (!side || side.style === 'none') return;
  const widths: Record<BorderSide['style'], number> = {
    none: 0,
    thin: 1,
    medium: 2,
    thick: 3,
    dashed: 1,
    dotted: 1,
    double: 3,
  };
  const dashes: Partial<Record<BorderSide['style'], number[]>> = {
    dashed: [4, 2],
    dotted: [1, 2],
  };
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = side.color ?? '#1f2328';
  ctx.lineWidth = widths[side.style];
  ctx.setLineDash(dashes[side.style] ?? []);
  if (side.style === 'double') {
    // Render as two thin parallel lines
    const off = 1.5;
    const horiz = y0 === y1;
    ctx.lineWidth = 1;
    ctx.moveTo(x0 + (horiz ? 0 : -off), y0 + (horiz ? -off : 0));
    ctx.lineTo(x1 + (horiz ? 0 : -off), y1 + (horiz ? -off : 0));
    ctx.moveTo(x0 + (horiz ? 0 : off), y0 + (horiz ? off : 0));
    ctx.lineTo(x1 + (horiz ? 0 : off), y1 + (horiz ? off : 0));
  } else {
    ctx.moveTo(x0 + 0.5, y0 + 0.5);
    ctx.lineTo(x1 + 0.5, y1 + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Measure the widest text in `col` across all populated rows. Used for autofit.
 * The caller must supply a 2D context (for measureText).
 */
export function measureColumnWidth(
  sheet: Sheet,
  workbook: Workbook,
  col: number,
  ctx: CanvasRenderingContext2D,
): number {
  let max = 0;
  for (const [key, cell] of sheet.cells) {
    const c = key % 16384;
    if (c !== col) continue;
    const style =
      cell.styleId !== undefined ? workbook.styles.get(cell.styleId) : undefined;
    const size = style?.fontSize ?? 12;
    const weight = style?.bold ? 'bold' : 'normal';
    const italic = style?.italic ? 'italic' : 'normal';
    ctx.font = `${italic} ${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
    const raw = cell.computed ?? cell.value ?? cell.raw;
    const text = formatValue(raw ?? null, style?.format ?? cell.format);
    const w = ctx.measureText(text).width + 12;
    if (w > max) max = w;
  }
  return Math.max(24, Math.ceil(max));
}
