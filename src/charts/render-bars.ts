/**
 * Column (vertical) and bar (horizontal) chart renderers.
 * Supports grouped or stacked series.
 */

import type { ResolvedChartData, ResolvedSeries } from './data';
import type { ChartOptions } from '../engine/charts';
import { linearScale, stackExtent, valueExtent } from './scales';
import type { Plot } from './layout';
import { escapeXml } from './svg-utils';

export function renderBarsInto(
  plot: Plot,
  data: ResolvedChartData,
  opts: ChartOptions,
  orientation: 'column' | 'bar',
): string {
  const { inner } = plot;
  const catCount = data.categories.length;
  if (catCount === 0 || data.series.length === 0) return emptyLabel(plot);

  const stacked = opts.stacked ?? false;
  const matrix = data.series.map((s) => s.values);
  const extent = stacked ? stackExtent(matrix) : valueExtent(matrix);
  const primary = buildScale(extent, opts, orientation, plot);

  const catScale = (i: number) =>
    inner.x0 + ((i + 0.5) / catCount) * (inner.x1 - inner.x0);
  const catScaleV = (i: number) =>
    inner.y0 + ((i + 0.5) / catCount) * (inner.y1 - inner.y0);

  const bandWidth = ((inner.x1 - inner.x0) / catCount) * 0.75;
  const bandHeight = ((inner.y1 - inner.y0) / catCount) * 0.75;
  const groupSize = stacked ? 1 : data.series.length;

  const parts: string[] = [];
  parts.push(gridAndAxes(plot, primary, data.categories, orientation));

  if (stacked) {
    const positives = new Array(catCount).fill(0) as number[];
    const negatives = new Array(catCount).fill(0) as number[];
    data.series.forEach((series, sIdx) => {
      series.values.forEach((raw, idx) => {
        if (raw === null) return;
        const baseline = raw >= 0 ? positives[idx]! : negatives[idx]!;
        const v0 = baseline;
        const v1 = baseline + raw;
        if (raw >= 0) positives[idx] = v1;
        else negatives[idx] = v1;
        parts.push(bar(sIdx, series, idx, v0, v1));
      });
    });
  } else {
    data.series.forEach((series, sIdx) => {
      series.values.forEach((raw, idx) => {
        if (raw === null) return;
        parts.push(bar(sIdx, series, idx, 0, raw));
      });
    });
  }

  return parts.join('\n');

  function bar(sIdx: number, series: ResolvedSeries, idx: number, v0: number, v1: number): string {
    const y0 = primary(v0);
    const y1 = primary(v1);
    if (orientation === 'column') {
      const centerX = catScale(idx);
      const slot = stacked ? bandWidth : bandWidth / groupSize;
      const offset = stacked ? 0 : (sIdx - (groupSize - 1) / 2) * slot;
      const x = centerX + offset - slot / 2;
      const rectY = Math.min(y0, y1);
      const rectH = Math.max(1, Math.abs(y1 - y0));
      return `<rect x="${fmt(x)}" y="${fmt(rectY)}" width="${fmt(slot)}" height="${fmt(rectH)}" fill="${series.color}" data-series="${escapeXml(series.name)}" data-category="${escapeXml(data.categories[idx] ?? '')}"/>`;
    }
    const centerY = catScaleV(idx);
    const slot = stacked ? bandHeight : bandHeight / groupSize;
    const offset = stacked ? 0 : (sIdx - (groupSize - 1) / 2) * slot;
    const y = centerY + offset - slot / 2;
    const rectX = Math.min(y0, y1);
    const rectW = Math.max(1, Math.abs(y1 - y0));
    return `<rect x="${fmt(rectX)}" y="${fmt(y)}" width="${fmt(rectW)}" height="${fmt(slot)}" fill="${series.color}" data-series="${escapeXml(series.name)}" data-category="${escapeXml(data.categories[idx] ?? '')}"/>`;
  }
}

function buildScale(
  extent: { min: number; max: number },
  opts: ChartOptions,
  orientation: 'column' | 'bar',
  plot: Plot,
): ReturnType<typeof linearScale> {
  const { inner } = plot;
  const padMin = Math.min(extent.min, 0);
  const padMax = Math.max(extent.max, 0);
  const forceMin = opts.yMin;
  const forceMax = opts.yMax;
  if (orientation === 'column') {
    return linearScale(padMin, padMax, inner.y1, inner.y0, { forceMin, forceMax });
  }
  return linearScale(padMin, padMax, inner.x0, inner.x1, { forceMin, forceMax });
}

function gridAndAxes(
  plot: Plot,
  scale: ReturnType<typeof linearScale>,
  categories: string[],
  orientation: 'column' | 'bar',
): string {
  const { inner } = plot;
  const lines: string[] = [];
  const axisStroke = '#d0d7de';
  const textColor = '#57606a';
  for (const t of scale.ticks) {
    if (orientation === 'column') {
      const y = scale(t);
      lines.push(
        `<line x1="${fmt(inner.x0)}" x2="${fmt(inner.x1)}" y1="${fmt(y)}" y2="${fmt(y)}" stroke="${axisStroke}" stroke-dasharray="2,2"/>`,
      );
      lines.push(
        `<text x="${fmt(inner.x0 - 6)}" y="${fmt(y + 4)}" text-anchor="end" font-size="10" fill="${textColor}">${fmt(t)}</text>`,
      );
    } else {
      const x = scale(t);
      lines.push(
        `<line x1="${fmt(x)}" x2="${fmt(x)}" y1="${fmt(inner.y0)}" y2="${fmt(inner.y1)}" stroke="${axisStroke}" stroke-dasharray="2,2"/>`,
      );
      lines.push(
        `<text x="${fmt(x)}" y="${fmt(inner.y1 + 14)}" text-anchor="middle" font-size="10" fill="${textColor}">${fmt(t)}</text>`,
      );
    }
  }
  categories.forEach((cat, i) => {
    if (orientation === 'column') {
      const cx = inner.x0 + ((i + 0.5) / categories.length) * (inner.x1 - inner.x0);
      lines.push(
        `<text x="${fmt(cx)}" y="${fmt(inner.y1 + 14)}" text-anchor="middle" font-size="10" fill="${textColor}">${escapeXml(cat)}</text>`,
      );
    } else {
      const cy = inner.y0 + ((i + 0.5) / categories.length) * (inner.y1 - inner.y0);
      lines.push(
        `<text x="${fmt(inner.x0 - 6)}" y="${fmt(cy + 4)}" text-anchor="end" font-size="10" fill="${textColor}">${escapeXml(cat)}</text>`,
      );
    }
  });
  // Plot frame
  lines.push(
    `<rect x="${fmt(inner.x0)}" y="${fmt(inner.y0)}" width="${fmt(inner.x1 - inner.x0)}" height="${fmt(inner.y1 - inner.y0)}" fill="none" stroke="${axisStroke}"/>`,
  );
  return lines.join('\n');
}

function emptyLabel(plot: Plot): string {
  const { inner } = plot;
  const x = (inner.x0 + inner.x1) / 2;
  const y = (inner.y0 + inner.y1) / 2;
  return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" font-size="12" fill="#8c959f">(no data)</text>`;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? Number(n.toFixed(2)).toString() : '0';
}
