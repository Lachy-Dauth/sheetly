/**
 * Pivot cache: snapshot of a source range as a list of typed records. This
 * isolates pivot aggregation from the grid/cell layer so the layout code can
 * work on a small pure data structure.
 */

import type { Workbook } from './workbook';
import type { Sheet } from './sheet';
import type { Scalar } from './cell';
import type { PivotField, PivotGrouping, PivotSource } from './pivots';
import { isErrorValue } from './cell';

export interface PivotRow {
  index: number; // 0-based row index within the source data rows (excluding header)
  values: Scalar[];
}

export interface PivotCache {
  headers: string[];
  rows: PivotRow[];
  source: PivotSource;
}

export function buildPivotCache(workbook: Workbook, source: PivotSource): PivotCache {
  const sheet = workbook.getSheet(source.sheetId);
  const { start, end } = source.range;
  const colCount = end.col - start.col + 1;
  const rows: PivotRow[] = [];
  const headers: string[] = [];
  const startRow = source.hasHeader ? start.row + 1 : start.row;

  if (source.hasHeader) {
    for (let c = 0; c < colCount; c++) {
      const v = readScalar(sheet, { row: start.row, col: start.col + c });
      headers.push(stringify(v) || `Column${c + 1}`);
    }
  } else {
    for (let c = 0; c < colCount; c++) headers.push(`Column${c + 1}`);
  }

  let idx = 0;
  for (let r = startRow; r <= end.row; r++) {
    const row: Scalar[] = [];
    let hasValue = false;
    for (let c = 0; c < colCount; c++) {
      const v = readScalar(sheet, { row: r, col: start.col + c });
      row.push(v);
      if (v !== null && v !== '') hasValue = true;
    }
    if (hasValue) rows.push({ index: idx, values: row });
    idx++;
  }

  return { headers, rows, source };
}

function readScalar(sheet: Sheet, address: { row: number; col: number }): Scalar {
  const cell = sheet.getCell(address);
  if (!cell) return null;
  const v = cell.computed ?? cell.value ?? null;
  if (v !== null && v !== undefined) return v;
  if (typeof cell.raw === 'number' || typeof cell.raw === 'boolean' || typeof cell.raw === 'string') {
    return cell.raw;
  }
  return null;
}

function stringify(v: Scalar): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isErrorValue(v)) return v.code;
  return '';
}

/**
 * Produce a grouping key for a value according to the field's grouping rule.
 * Returns both a sort key (for ordering) and a display label.
 */
export function groupKey(field: PivotField, v: Scalar): { key: string; sort: number | string; label: string } {
  const grouping: PivotGrouping = field.grouping ?? { kind: 'none' };
  if (grouping.kind === 'none') {
    const label = stringify(v);
    const sort = typeof v === 'number' ? v : label.toLowerCase();
    return { key: label, sort, label: label || '(blank)' };
  }
  if (grouping.kind === 'date') {
    const d = parseDate(v);
    if (!d) return { key: '(blank)', sort: 'zzzz', label: '(blank)' };
    const y = d.getFullYear();
    const m = d.getMonth();
    const q = Math.floor(m / 3) + 1;
    const day = d.getDate();
    switch (grouping.unit) {
      case 'year':
        return { key: String(y), sort: y, label: String(y) };
      case 'quarter':
        return { key: `${y}-Q${q}`, sort: y * 10 + q, label: `${y} Q${q}` };
      case 'month': {
        const mm = (m + 1).toString().padStart(2, '0');
        return { key: `${y}-${mm}`, sort: y * 100 + m, label: `${MONTHS[m]} ${y}` };
      }
      case 'day': {
        const mm = (m + 1).toString().padStart(2, '0');
        const dd = day.toString().padStart(2, '0');
        return { key: `${y}-${mm}-${dd}`, sort: y * 10000 + m * 100 + day, label: `${y}-${mm}-${dd}` };
      }
    }
  }
  if (grouping.kind === 'numberRange') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return { key: '(blank)', sort: Infinity, label: '(blank)' };
    const start = grouping.start ?? 0;
    // Step must be positive; fall back to an ungrouped key when caller passes 0/NaN.
    if (!(grouping.step > 0)) {
      const label = num(n);
      return { key: label, sort: n, label };
    }
    const bucket = Math.floor((n - start) / grouping.step);
    const lo = start + bucket * grouping.step;
    const hi = lo + grouping.step;
    const label = `${num(lo)}–${num(hi)}`;
    return { key: label, sort: lo, label };
  }
  return { key: stringify(v), sort: stringify(v), label: stringify(v) || '(blank)' };
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseDate(v: Scalar): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Treat numbers as Excel serial dates (1900-based).
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) return d;
    return null;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (Number.isFinite(d.getTime())) return d;
    return null;
  }
  return null;
}

function num(n: number): string {
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 1 ? 2 : 3;
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.?0+$/, '') : String(n);
}
