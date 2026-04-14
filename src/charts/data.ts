/**
 * Pull chart-ready data (categories + series) out of a workbook range.
 */

import type { Chart } from '../engine/charts';
import { defaultSeriesColor } from '../engine/charts';
import type { Sheet } from '../engine/sheet';
import type { Scalar } from '../engine/cell';
import { isErrorValue } from '../engine/cell';
import type { Workbook } from '../engine/workbook';
import { parseRef } from '../engine/address';
import type { Address } from '../engine/address';

export interface ResolvedSeries {
  name: string;
  color: string;
  axis: 'primary' | 'secondary';
  trendline?: Chart['series'][number]['trendline'];
  stack?: string;
  values: (number | null)[];
}

export interface ResolvedChartData {
  categories: string[];
  categoryNumeric: (number | null)[];
  series: ResolvedSeries[];
}

function readScalar(sheet: Sheet, address: Address): Scalar {
  const c = sheet.getCell(address);
  if (!c) return null;
  const v = c.computed ?? c.value ?? null;
  if (v !== null && v !== undefined) return v;
  if (typeof c.raw === 'number' || typeof c.raw === 'boolean' || typeof c.raw === 'string') {
    return c.raw;
  }
  return null;
}

function asNumber(v: Scalar): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErrorValue(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asText(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErrorValue(v)) return v.code;
  return '';
}

export function resolveChartData(workbook: Workbook, chart: Chart): ResolvedChartData {
  const sheet = workbook.getSheet(chart.sheetId);
  const { start, end } = chart.range;
  const firstDataRow = chart.hasHeaderRow ? start.row + 1 : start.row;
  const firstDataCol = chart.hasCategoryColumn ? start.col + 1 : start.col;

  const categories: string[] = [];
  const categoryNumeric: (number | null)[] = [];
  for (let row = firstDataRow; row <= end.row; row++) {
    const v = chart.hasCategoryColumn
      ? readScalar(sheet, { row, col: start.col })
      : (row - firstDataRow + 1);
    categories.push(asText(v));
    categoryNumeric.push(asNumber(v));
  }

  const series: ResolvedSeries[] = [];
  let seriesIdx = 0;
  for (let col = firstDataCol; col <= end.col; col++) {
    const cfg = chart.series[seriesIdx] ?? {};
    const header = chart.hasHeaderRow
      ? asText(readScalar(sheet, { row: start.row, col }))
      : '';
    const name = cfg.name || header || `Series ${seriesIdx + 1}`;
    const color = cfg.color ?? defaultSeriesColor(seriesIdx);
    const values: (number | null)[] = [];
    for (let row = firstDataRow; row <= end.row; row++) {
      values.push(asNumber(readScalar(sheet, { row, col })));
    }
    series.push({
      name,
      color,
      axis: cfg.axis ?? 'primary',
      trendline: cfg.trendline,
      stack: cfg.stack,
      values,
    });
    seriesIdx++;
  }

  return { categories, categoryNumeric, series };
}

/** Resolve an A1 range string to an array of numeric values for sparkline use. */
export function resolveNumericRange(
  workbook: Workbook,
  defaultSheetId: string,
  ref: string,
): number[] {
  const parsed = parseRef(ref);
  if (!parsed) return [];
  const sheet = parsed.sheet
    ? workbook.sheetByName(parsed.sheet) ?? workbook.getSheet(defaultSheetId)
    : workbook.getSheet(defaultSheetId);
  const out: number[] = [];
  for (let row = parsed.start.row; row <= parsed.end.row; row++) {
    for (let col = parsed.start.col; col <= parsed.end.col; col++) {
      const v = asNumber(readScalar(sheet, { row, col }));
      if (v !== null) out.push(v);
    }
  }
  return out;
}
