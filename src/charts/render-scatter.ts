/** Scatter plot: x = category (numeric), y = series value. */

import type { ResolvedChartData } from './data';
import type { ChartOptions } from '../engine/charts';
import { linearScale, valueExtent } from './scales';
import type { Plot } from './layout';
import { escapeXml, fmtNum as fmt } from './svg-utils';

export function renderScatterInto(
  plot: Plot,
  data: ResolvedChartData,
  opts: ChartOptions,
): string {
  const { inner } = plot;
  if (data.series.length === 0) return empty(plot);

  const xs = data.categoryNumeric.filter((v): v is number => v !== null);
  const xDomain =
    xs.length > 0 ? { min: Math.min(...xs), max: Math.max(...xs) } : { min: 0, max: 1 };
  const yExtent = valueExtent(data.series.map((s) => s.values));
  const xScale = linearScale(xDomain.min, xDomain.max, inner.x0, inner.x1, { padFraction: 0.05 });
  const yScale = linearScale(yExtent.min, yExtent.max, inner.y1, inner.y0, {
    forceMin: opts.yMin,
    forceMax: opts.yMax,
    padFraction: 0.05,
  });

  const parts: string[] = [];
  // Gridlines + axes
  for (const t of yScale.ticks) {
    const y = yScale(t);
    parts.push(
      `<line x1="${fmt(inner.x0)}" x2="${fmt(inner.x1)}" y1="${fmt(y)}" y2="${fmt(y)}" stroke="#d0d7de" stroke-dasharray="2,2"/>`,
      `<text x="${fmt(inner.x0 - 6)}" y="${fmt(y + 4)}" text-anchor="end" font-size="10" fill="#57606a">${fmt(t)}</text>`,
    );
  }
  for (const t of xScale.ticks) {
    const x = xScale(t);
    parts.push(
      `<line x1="${fmt(x)}" x2="${fmt(x)}" y1="${fmt(inner.y0)}" y2="${fmt(inner.y1)}" stroke="#d0d7de" stroke-dasharray="2,2"/>`,
      `<text x="${fmt(x)}" y="${fmt(inner.y1 + 14)}" text-anchor="middle" font-size="10" fill="#57606a">${fmt(t)}</text>`,
    );
  }
  parts.push(
    `<rect x="${fmt(inner.x0)}" y="${fmt(inner.y0)}" width="${fmt(inner.x1 - inner.x0)}" height="${fmt(inner.y1 - inner.y0)}" fill="none" stroke="#d0d7de"/>`,
  );

  for (const series of data.series) {
    series.values.forEach((v, i) => {
      if (v === null) return;
      const xRaw = data.categoryNumeric[i] ?? i;
      parts.push(
        `<circle cx="${fmt(xScale(xRaw))}" cy="${fmt(yScale(v))}" r="3.5" fill="${series.color}"><title>${escapeXml(series.name)}: (${fmt(xRaw)}, ${fmt(v)})</title></circle>`,
      );
    });
  }
  return parts.join('\n');
}

function empty(plot: Plot): string {
  const x = (plot.inner.x0 + plot.inner.x1) / 2;
  const y = (plot.inner.y0 + plot.inner.y1) / 2;
  return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" font-size="12" fill="#8c959f">(no data)</text>`;
}
