/**
 * Pie and doughnut renderers. Uses the first series as slice values.
 */

import type { ResolvedChartData } from './data';
import type { ChartOptions } from '../engine/charts';
import type { Plot } from './layout';
import { escapeXml, fmtNum as fmt } from './svg-utils';
import { defaultSeriesColor } from '../engine/charts';

export function renderPieInto(
  plot: Plot,
  data: ResolvedChartData,
  _opts: ChartOptions,
  hollow: boolean,
): string {
  const { inner } = plot;
  if (data.series.length === 0) return empty(plot);
  const series = data.series[0]!;
  const labels = data.categories;
  const raw = series.values.map((v) => (v === null || v < 0 ? 0 : v));
  const total = raw.reduce((acc, v) => acc + v, 0);
  if (total === 0) return empty(plot);

  const cx = (inner.x0 + inner.x1) / 2;
  const cy = (inner.y0 + inner.y1) / 2;
  const r = Math.min(inner.x1 - inner.x0, inner.y1 - inner.y0) / 2 - 8;
  const rInner = hollow ? r * 0.55 : 0;
  let angle = -Math.PI / 2;
  const parts: string[] = [];
  raw.forEach((v, i) => {
    if (v <= 0) return;
    const frac = v / total;
    const next = angle + frac * 2 * Math.PI;
    const color = data.series[0]!.color && i === 0 ? series.color : defaultSeriesColor(i);
    parts.push(
      `<path d="${slicePath(cx, cy, r, rInner, angle, next)}" fill="${color}"><title>${escapeXml(labels[i] ?? '')}: ${fmt(v)} (${fmt(frac * 100)}%)</title></path>`,
    );
    angle = next;
  });
  return parts.join('\n');
}

function slicePath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const x0 = cx + Math.cos(a0) * rOuter;
  const y0 = cy + Math.sin(a0) * rOuter;
  const x1 = cx + Math.cos(a1) * rOuter;
  const y1 = cy + Math.sin(a1) * rOuter;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (rInner === 0) {
    return `M${fmt(cx)},${fmt(cy)} L${fmt(x0)},${fmt(y0)} A${fmt(rOuter)},${fmt(rOuter)} 0 ${large} 1 ${fmt(x1)},${fmt(y1)} Z`;
  }
  const ix0 = cx + Math.cos(a1) * rInner;
  const iy0 = cy + Math.sin(a1) * rInner;
  const ix1 = cx + Math.cos(a0) * rInner;
  const iy1 = cy + Math.sin(a0) * rInner;
  return `M${fmt(x0)},${fmt(y0)} A${fmt(rOuter)},${fmt(rOuter)} 0 ${large} 1 ${fmt(x1)},${fmt(y1)} L${fmt(ix0)},${fmt(iy0)} A${fmt(rInner)},${fmt(rInner)} 0 ${large} 0 ${fmt(ix1)},${fmt(iy1)} Z`;
}

function empty(plot: Plot): string {
  const x = (plot.inner.x0 + plot.inner.x1) / 2;
  const y = (plot.inner.y0 + plot.inner.y1) / 2;
  return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" font-size="12" fill="#8c959f">(no data)</text>`;
}
