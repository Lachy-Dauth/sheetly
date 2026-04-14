/**
 * Render a Sheet to a standalone HTML document so the user can "Save as PDF"
 * via their browser's print dialog. Preserves fills, alignment, font weight,
 * merges, column widths, and row heights.
 */

import type { Sheet } from '../engine/sheet';
import type { Workbook } from '../engine/workbook';
import type { Style } from '../engine/styles';
import type { Cell } from '../engine/cell';
import { formatValue } from '../grid/format';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '../engine/sheet';

export interface PrintOptions {
  /** Include row numbers / column letters. */
  showHeaders?: boolean;
  /** Include the sheet name as an `<h1>`. */
  showTitle?: boolean;
  /** Restrict the output to this rectangle (inclusive). Defaults to used range. */
  rows?: { start: number; end: number };
  cols?: { start: number; end: number };
}

/** Produce a self-contained HTML string. Safe to open via `window.open`. */
export function renderSheetToHtml(
  workbook: Workbook,
  sheet: Sheet,
  options: PrintOptions = {},
): string {
  const showHeaders = options.showHeaders ?? false;
  const showTitle = options.showTitle ?? true;
  const rowRange = options.rows ?? { start: 0, end: Math.max(sheet.maxRow, 0) };
  const colRange = options.cols ?? { start: 0, end: Math.max(sheet.maxCol, 0) };

  // Cells covered by a merge other than the anchor should be skipped; anchors
  // get rowspan/colspan.
  const skip = new Set<number>();
  for (const m of sheet.merges) {
    for (let r = m.range.start.row; r <= m.range.end.row; r++) {
      for (let c = m.range.start.col; c <= m.range.end.col; c++) {
        if (r === m.range.start.row && c === m.range.start.col) continue;
        skip.add(r * 16384 + c);
      }
    }
  }

  const rows: string[] = [];
  for (let r = rowRange.start; r <= rowRange.end; r++) {
    const height = sheet.rowHeight(r) ?? DEFAULT_ROW_HEIGHT;
    const cells: string[] = [];
    if (showHeaders) {
      cells.push(`<th class="rh">${r + 1}</th>`);
    }
    for (let c = colRange.start; c <= colRange.end; c++) {
      if (skip.has(r * 16384 + c)) continue;
      const addr = { row: r, col: c };
      const cell = sheet.getCell(addr);
      const merge = sheet.findMergeAt(addr);
      let rowspan = 1;
      let colspan = 1;
      if (merge && merge.range.start.row === r && merge.range.start.col === c) {
        rowspan = merge.range.end.row - merge.range.start.row + 1;
        colspan = merge.range.end.col - merge.range.start.col + 1;
      }
      const style = resolveStyle(workbook, cell);
      const display = resolveDisplay(cell);
      const styleAttr = styleToCss(style);
      const spanAttr = `${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${
        colspan > 1 ? ` colspan="${colspan}"` : ''
      }`;
      cells.push(`<td${spanAttr} style="${styleAttr}">${escapeHtml(display)}</td>`);
    }
    rows.push(`<tr style="height:${height}px">${cells.join('')}</tr>`);
  }

  const colGroup: string[] = [];
  if (showHeaders) colGroup.push('<col style="width:48px"/>');
  for (let c = colRange.start; c <= colRange.end; c++) {
    colGroup.push(`<col style="width:${sheet.colWidth(c) ?? DEFAULT_COL_WIDTH}px"/>`);
  }

  let headerRow = '';
  if (showHeaders) {
    const letters = [];
    letters.push('<th class="ch"></th>');
    for (let c = colRange.start; c <= colRange.end; c++) {
      letters.push(`<th class="ch">${columnLetters(c)}</th>`);
    }
    headerRow = `<tr>${letters.join('')}</tr>`;
  }

  const title = showTitle
    ? `<h1>${escapeHtml(sheet.name)}</h1>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(sheet.name)}</title>
<style>
  body { font: 12px -apple-system, system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  table { border-collapse: collapse; width: auto; }
  td, th { border: 1px solid #888; padding: 2px 6px; vertical-align: middle; }
  th.rh, th.ch { background: #f1f1f1; font-weight: 600; text-align: center; }
  @media print {
    body { margin: 0; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
  ${title}
  <table>
    <colgroup>${colGroup.join('')}</colgroup>
    ${headerRow}
    ${rows.join('\n    ')}
  </table>
</body>
</html>`;
}

/** Open the rendered HTML in a new window and trigger print. */
export function printSheet(workbook: Workbook, sheet: Sheet, options?: PrintOptions): void {
  if (typeof window === 'undefined') return;
  const html = renderSheetToHtml(workbook, sheet, options);
  // `noopener` makes window.open return null in modern browsers, so we can't
  // write to the document. Use a Blob URL instead — the browser navigates to
  // it directly and shows the rendered sheet, then auto-prints when loaded.
  const withAutoPrint = html.replace(
    '</body>',
    `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script></body>`,
  );
  const blob = new Blob([withAutoPrint], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Pop-up blocker: fall back to navigating the current tab.
    window.location.href = url;
    return;
  }
  // Revoke later so the new window has time to load the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function resolveStyle(workbook: Workbook, cell: Cell | undefined): Style {
  if (!cell || cell.styleId === undefined) return {};
  return workbook.styles.get(cell.styleId);
}

function resolveDisplay(cell: Cell | undefined): string {
  if (!cell) return '';
  const value = cell.computed ?? cell.value ?? cell.raw;
  return formatValue(value as never, cell.format);
}

function styleToCss(style: Style): string {
  const parts: string[] = [];
  if (style.bold) parts.push('font-weight:700');
  if (style.italic) parts.push('font-style:italic');
  if (style.underline || style.strike) {
    const deco = [
      style.underline ? 'underline' : null,
      style.strike ? 'line-through' : null,
    ]
      .filter(Boolean)
      .join(' ');
    parts.push(`text-decoration:${deco}`);
  }
  if (style.color) parts.push(`color:${style.color}`);
  if (style.fill) parts.push(`background:${style.fill}`);
  if (style.align) parts.push(`text-align:${style.align}`);
  if (style.valign) parts.push(`vertical-align:${style.valign === 'middle' ? 'middle' : style.valign}`);
  if (style.wrap) parts.push('white-space:pre-wrap');
  else parts.push('white-space:nowrap');
  if (style.fontSize) parts.push(`font-size:${style.fontSize}px`);
  if (style.font) parts.push(`font-family:${style.font}`);
  return parts.join(';');
}

function columnLetters(col: number): string {
  let n = col;
  let s = '';
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    if (n < 26) break;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
