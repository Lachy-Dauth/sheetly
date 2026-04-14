/**
 * Compute a 2D output matrix from a pivot + its cache.
 * The matrix is a pure Scalar[][] that can be written to sheet cells or
 * rendered directly. Source-row tracking is preserved so drill-down works.
 */

import type { Scalar } from './cell';
import { isErrorValue } from './cell';
import type { Pivot, PivotField, PivotFilter, PivotValueField } from './pivots';
import { groupKey, type PivotCache, type PivotRow } from './pivot-cache';
import { createAggregator } from './pivot-aggregate';

export interface PivotOutput {
  matrix: (Scalar | null)[][];
  /** The source rows that contributed to each output cell (row, col) => PivotRow[]. */
  provenance: PivotRow[][][];
  /** Axis labels (for UI). */
  rowLabels: string[][];
  colLabels: string[][];
  valueHeaders: string[];
}

type GroupedKey = { key: string; sort: number | string; label: string };

export function computePivotLayout(pivot: Pivot, cache: PivotCache): PivotOutput {
  const filtered = applyFilters(cache.rows, pivot.filters);

  const rowKeysSet = new Map<string, GroupedKey[]>();
  const colKeysSet = new Map<string, GroupedKey[]>();
  const rowIndex = new Map<string, PivotRow[]>();
  const colIndex = new Map<string, PivotRow[]>();
  const cellIndex = new Map<string, PivotRow[]>();

  for (const row of filtered) {
    const rKey = composedKey(pivot.rows, row.values);
    const cKey = composedKey(pivot.cols, row.values);
    rowKeysSet.set(rKey.key, rKey.parts);
    colKeysSet.set(cKey.key, cKey.parts);
    pushGroup(rowIndex, rKey.key, row);
    pushGroup(colIndex, cKey.key, row);
    pushGroup(cellIndex, `${rKey.key}\u0001${cKey.key}`, row);
  }

  const rowKeys = sortKeys(rowKeysSet, pivot.rows);
  const colKeys = sortKeys(colKeysSet, pivot.cols);

  const valueHeaders = pivot.values.map(
    (v) => v.label ?? `${labelFor(v)} (${cache.headers[v.sourceColumn] ?? '?'})`,
  );

  const headerRows = Math.max(1, pivot.cols.length) + (pivot.cols.length > 0 && pivot.values.length > 1 ? 1 : 0);
  const headerCols = Math.max(1, pivot.rows.length);
  const gtRow = pivot.grandTotals.rows ? 1 : 0;
  const gtCol = pivot.grandTotals.cols ? 1 : 0;
  const valuesPerCol = pivot.values.length || 1;

  const totalRows = headerRows + rowKeys.length + gtRow;
  const totalCols = headerCols + colKeys.length * valuesPerCol + gtCol * valuesPerCol;

  const matrix: (Scalar | null)[][] = Array.from({ length: totalRows }, () =>
    Array(totalCols).fill(null) as (Scalar | null)[],
  );
  const provenance: PivotRow[][][] = Array.from({ length: totalRows }, () =>
    Array.from({ length: totalCols }, () => [] as PivotRow[]),
  );

  // Row axis headers
  pivot.rows.forEach((field, i) => {
    matrix[headerRows - 1]![i] = labelFor(field, cache.headers);
  });
  // Column axis headers (first N rows). Each column key contributes one or more cells.
  colKeys.forEach((keyEntry, colIdx) => {
    keyEntry.parts.forEach((part, depth) => {
      for (let vi = 0; vi < valuesPerCol; vi++) {
        matrix[depth]![headerCols + colIdx * valuesPerCol + vi] = part.label;
      }
    });
  });
  // Sub-header for multiple value fields
  if (pivot.values.length > 1 && pivot.cols.length > 0) {
    colKeys.forEach((_key, colIdx) => {
      pivot.values.forEach((_v, vi) => {
        matrix[headerRows - 1]![headerCols + colIdx * valuesPerCol + vi] = valueHeaders[vi]!;
      });
    });
  } else if (pivot.cols.length === 0) {
    // No column axis: value headers become the column titles.
    pivot.values.forEach((_v, vi) => {
      matrix[headerRows - 1]![headerCols + vi] = valueHeaders[vi]!;
    });
  }

  // Row labels
  rowKeys.forEach((keyEntry, rowIdx) => {
    keyEntry.parts.forEach((part, depth) => {
      matrix[headerRows + rowIdx]![depth] = part.label;
    });
  });

  // Body cells
  rowKeys.forEach((rEntry, rowIdx) => {
    colKeys.forEach((cEntry, colIdx) => {
      const rows = cellIndex.get(`${rEntry.key}\u0001${cEntry.key}`) ?? [];
      pivot.values.forEach((vField, vi) => {
        const col = headerCols + colIdx * valuesPerCol + vi;
        matrix[headerRows + rowIdx]![col] = aggregate(vField, rows, cache);
        provenance[headerRows + rowIdx]![col] = rows;
      });
    });
    if (gtCol) {
      const rows = rowIndex.get(rEntry.key) ?? [];
      pivot.values.forEach((vField, vi) => {
        const col = headerCols + colKeys.length * valuesPerCol + vi;
        matrix[headerRows + rowIdx]![col] = aggregate(vField, rows, cache);
        provenance[headerRows + rowIdx]![col] = rows;
      });
    }
  });

  // Column grand totals row
  if (gtRow) {
    const r = headerRows + rowKeys.length;
    matrix[r]![0] = 'Grand Total';
    colKeys.forEach((cEntry, colIdx) => {
      const rows = colIndex.get(cEntry.key) ?? [];
      pivot.values.forEach((vField, vi) => {
        const col = headerCols + colIdx * valuesPerCol + vi;
        matrix[r]![col] = aggregate(vField, rows, cache);
        provenance[r]![col] = rows;
      });
    });
    if (gtCol) {
      pivot.values.forEach((vField, vi) => {
        const col = headerCols + colKeys.length * valuesPerCol + vi;
        matrix[r]![col] = aggregate(vField, filtered, cache);
        provenance[r]![col] = filtered;
      });
    }
  }
  // Top-right "Grand Total" label
  if (gtCol) {
    matrix[headerRows - 1]![headerCols + colKeys.length * valuesPerCol] = 'Grand Total';
  }

  return {
    matrix,
    provenance,
    rowLabels: rowKeys.map((k) => k.parts.map((p) => p.label)),
    colLabels: colKeys.map((k) => k.parts.map((p) => p.label)),
    valueHeaders,
  };
}

function applyFilters(rows: PivotRow[], filters: PivotFilter[]): PivotRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => {
    for (const f of filters) {
      if (!f.accept || f.accept.length === 0) continue;
      const v = row.values[f.sourceColumn]!;
      const g = groupKey(f, v);
      if (!f.accept.includes(g.key)) return false;
    }
    return true;
  });
}

function composedKey(fields: PivotField[], row: Scalar[]): { key: string; parts: GroupedKey[] } {
  if (fields.length === 0) return { key: '__all__', parts: [{ key: '__all__', sort: 0, label: 'Total' }] };
  const parts = fields.map((f) => groupKey(f, row[f.sourceColumn] ?? null));
  return { key: parts.map((p) => p.key).join('\u0001'), parts };
}

function pushGroup(map: Map<string, PivotRow[]>, key: string, row: PivotRow): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(row);
}

function sortKeys(
  map: Map<string, GroupedKey[]>,
  fields: PivotField[],
): { key: string; parts: GroupedKey[] }[] {
  const entries = [...map.entries()].map(([key, parts]) => ({ key, parts }));
  entries.sort((a, b) => {
    for (let i = 0; i < a.parts.length; i++) {
      const ap = a.parts[i]!;
      const bp = b.parts[i]!;
      let cmp = 0;
      if (typeof ap.sort === 'number' && typeof bp.sort === 'number') cmp = ap.sort - bp.sort;
      else cmp = String(ap.sort).localeCompare(String(bp.sort), undefined, { numeric: true });
      if (fields[i]?.descending) cmp = -cmp;
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return entries;
}

function aggregate(
  vField: PivotValueField,
  rows: PivotRow[],
  _cache: PivotCache,
): Scalar | null {
  const agg = createAggregator(vField.agg);
  for (const row of rows) {
    const v = row.values[vField.sourceColumn];
    if (v === undefined) continue;
    agg.add(v);
  }
  const result = agg.result();
  return result === null ? null : result;
}

function labelFor(field: PivotField & { agg?: string }, headers?: string[]): string {
  if (field.label) return field.label;
  if (headers) return headers[field.sourceColumn] ?? `Col${field.sourceColumn + 1}`;
  if ('agg' in field && field.agg) return capitalize(field.agg as string);
  return '';
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Locate source rows for a specific output cell (for drill-down). */
export function drillDown(
  output: PivotOutput,
  row: number,
  col: number,
): PivotRow[] {
  return output.provenance[row]?.[col] ?? [];
}

/**
 * Detect whether a value is numeric/stringy enough to render into a cell.
 * Mostly a safety net — all our aggregators already return `number | null`.
 */
export function isScalar(v: unknown): v is Scalar {
  return (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    isErrorValue(v)
  );
}
