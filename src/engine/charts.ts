/**
 * Chart model: a named visualisation anchored to a sheet over a source range.
 * The renderer lives in src/charts/*; the engine only stores config + history.
 */

import type { RangeAddress } from './address';

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter';
export type TrendlineType = 'linear' | 'exp' | 'log' | 'poly2' | 'poly3';
export type LegendPos = 'top' | 'right' | 'bottom' | 'left' | 'none';

export interface ChartSeries {
  /** Optional override; resolved from headers when blank. */
  name?: string;
  color?: string;
  axis?: 'primary' | 'secondary';
  trendline?: TrendlineType;
  stack?: string;
}

export interface ChartOptions {
  title?: string;
  legend?: LegendPos;
  stacked?: boolean;
  showDataLabels?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  yMin?: number;
  yMax?: number;
}

export interface ChartAnchor {
  row: number;
  col: number;
  width: number;
  height: number;
}

export interface Chart {
  id: string;
  sheetId: string;
  type: ChartType;
  range: RangeAddress;
  hasHeaderRow: boolean;
  hasCategoryColumn: boolean;
  series: ChartSeries[];
  options: ChartOptions;
  anchor: ChartAnchor;
}

let nextId = 1;

const DEFAULT_COLORS = [
  '#1f6feb',
  '#2da44e',
  '#d29922',
  '#cf222e',
  '#8250df',
  '#218bff',
  '#bc4c00',
  '#116329',
];

export function defaultSeriesColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]!;
}

export function makeChart(args: {
  sheetId: string;
  type: ChartType;
  range: RangeAddress;
  hasHeaderRow?: boolean;
  hasCategoryColumn?: boolean;
  series?: ChartSeries[];
  options?: ChartOptions;
  anchor?: ChartAnchor;
}): Chart {
  return {
    id: `c${nextId++}`,
    sheetId: args.sheetId,
    type: args.type,
    range: args.range,
    hasHeaderRow: args.hasHeaderRow ?? true,
    hasCategoryColumn: args.hasCategoryColumn ?? true,
    series: args.series ?? [],
    options: args.options ?? { legend: 'bottom' },
    anchor: args.anchor ?? { row: 0, col: 0, width: 480, height: 320 },
  };
}

/** A sparkline stored on a single cell; resolved against another range in the workbook. */
export type SparklineType = 'line' | 'column' | 'winloss';

export interface Sparkline {
  type: SparklineType;
  /** A1-style range, may include a sheet prefix. */
  range: string;
  color?: string;
  negativeColor?: string;
  showMarkers?: boolean;
}
