/**
 * Line and area chart renderers. Skips null values by breaking path segments.
 */

import type { ResolvedChartData } from './data';
import type { ChartOptions, TrendlineType } from '../engine/charts';
import { linearScale, valueExtent } from './scales';
import type { Plot } from './layout';
import { escapeXml, fmtNum as fmt } from './svg-utils';
import { fitTrendline } from './trendline';

export function renderLineInto(
  plot: Plot,
  data: ResolvedChartData,
  opts: ChartOptions,
  filled: boolean,
): string {
  const { inner } = plot;
  if (data.categories.length === 0 || data.series.length === 0) {
    return `<text x="${fmt((inner.x0 + inner.x1) / 2)}" y="${fmt((inner.y0 + inner.y1) / 2)}" text-anchor="middle" font-size="12" fill="#8c959f">(no data)</text>`;
  }

  const matrix = data.series.map((s) => s.values);
  const extent = valueExtent(matrix);
  const yScale = linearScale(extent.min, extent.max, inner.y1, inner.y0, {
    forceMin: opts.yMin,
    forceMax: opts.yMax,
    padFraction: 0.05,
  });
  const n = data.categories.length;
  const xFor = (i: number) =>
    n === 1
      ? (inner.x0 + inner.x1) / 2
      : inner.x0 + (i / (n - 1)) * (inner.x1 - inner.x0);

  const parts: string[] = [];
  parts.push(gridAndAxes(plot, yScale, data.categories));

  for (const series of data.series) {
    const segments = splitRuns(series.values);
    for (const seg of segments) {
      const points = seg.indices.map((i, k) => ({ x: xFor(i), y: yScale(seg.values[k]!) }));
      if (points.length === 0) continue;
      if (filled) {
        const base = yScale(0);
        const d = linePath(points, true, base);
        parts.push(
          `<path d="${d}" fill="${series.color}" fill-opacity="0.25" stroke="${series.color}" stroke-width="1.5"/>`,
        );
      } else {
        parts.push(
          `<path d="${linePath(points, false)}" fill="none" stroke="${series.color}" stroke-width="2"/>`,
        );
      }
      for (const p of points) {
        parts.push(
          `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="2.5" fill="${series.color}"><title>${escapeXml(series.name)}</title></circle>`,
        );
      }
    }
    if (series.trendline) {
      parts.push(renderTrendline(series.trendline, series.values, series.color, xFor, yScale, n));
    }
  }

  return parts.join('\n');
}

function splitRuns(values: (number | null)[]): { indices: number[]; values: number[] }[] {
  const runs: { indices: number[]; values: number[] }[] = [];
  let current: { indices: number[]; values: number[] } | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      current = null;
      return;
    }
    if (!current) {
      current = { indices: [], values: [] };
      runs.push(current);
    }
    current.indices.push(i);
    current.values.push(v);
  });
  return runs;
}

function linePath(points: { x: number; y: number }[], close: boolean, baseY = 0): string {
  if (points.length === 0) return '';
  const seg = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)},${fmt(p.y)}`).join(' ');
  if (!close) return seg;
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${seg} L${fmt(last.x)},${fmt(baseY)} L${fmt(first.x)},${fmt(baseY)} Z`;
}

function renderTrendline(
  kind: TrendlineType,
  values: (number | null)[],
  color: string,
  xFor: (i: number) => number,
  yScale: (v: number) => number,
  n: number,
): string {
  const xs: number[] = [];
  const ys: number[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    xs.push(i);
    ys.push(v);
  });
  const fit = fitTrendline(xs, ys, kind);
  if (!fit) return '';
  const points: { x: number; y: number }[] = [];
  const steps = Math.max(16, n * 2);
  for (let s = 0; s <= steps; s++) {
    const x = (s / steps) * (n - 1);
    const y = fit.predict(x);
    if (!Number.isFinite(y)) continue;
    points.push({ x: xFor(x), y: yScale(y) });
  }
  return `<path d="${linePath(points, false)}" fill="none" stroke="${color}" stroke-width="1.25" stroke-dasharray="4,3" opacity="0.8"/>`;
}

function gridAndAxes(
  plot: Plot,
  yScale: ReturnType<typeof linearScale>,
  categories: string[],
): string {
  const { inner } = plot;
  const lines: string[] = [];
  for (const t of yScale.ticks) {
    const y = yScale(t);
    lines.push(
      `<line x1="${fmt(inner.x0)}" x2="${fmt(inner.x1)}" y1="${fmt(y)}" y2="${fmt(y)}" stroke="#d0d7de" stroke-dasharray="2,2"/>`,
    );
    lines.push(
      `<text x="${fmt(inner.x0 - 6)}" y="${fmt(y + 4)}" text-anchor="end" font-size="10" fill="#57606a">${fmt(t)}</text>`,
    );
  }
  categories.forEach((cat, i) => {
    const cx =
      categories.length === 1
        ? (inner.x0 + inner.x1) / 2
        : inner.x0 + (i / (categories.length - 1)) * (inner.x1 - inner.x0);
    lines.push(
      `<text x="${fmt(cx)}" y="${fmt(inner.y1 + 14)}" text-anchor="middle" font-size="10" fill="#57606a">${escapeXml(cat)}</text>`,
    );
  });
  lines.push(
    `<rect x="${fmt(inner.x0)}" y="${fmt(inner.y0)}" width="${fmt(inner.x1 - inner.x0)}" height="${fmt(inner.y1 - inner.y0)}" fill="none" stroke="#d0d7de"/>`,
  );
  return lines.join('\n');
}
