/**
 * Pure geometry for inline sparklines. Returns SVG strings (for snapshots) and
 * normalised point coordinates the canvas painter can consume.
 */

import type { Sparkline, SparklineType } from '../engine/charts';

export interface SparkPoint {
  x: number;
  y: number;
  raw: number;
}

export interface SparkLayout {
  type: SparklineType;
  width: number;
  height: number;
  /** Line points (only for type="line"). */
  line: SparkPoint[];
  /** Column or win/loss rects. */
  bars: Array<{ x: number; y: number; w: number; h: number; positive: boolean; zero: boolean }>;
  color: string;
  negativeColor: string;
}

export interface SparkConfig {
  values: number[];
  width: number;
  height: number;
  color?: string;
  negativeColor?: string;
  padding?: number;
}

export function computeSparkline(spark: Sparkline, values: number[], width: number, height: number): SparkLayout {
  const color = spark.color ?? '#1f6feb';
  const negativeColor = spark.negativeColor ?? '#cf222e';
  switch (spark.type) {
    case 'line':
      return layoutLine({ values, width, height, color, negativeColor });
    case 'column':
      return layoutColumns({ values, width, height, color, negativeColor });
    case 'winloss':
      return layoutWinLoss({ values, width, height, color, negativeColor });
  }
}

function layoutLine(c: SparkConfig): SparkLayout {
  const pad = c.padding ?? 1.5;
  const w = c.width;
  const h = c.height;
  const finite = c.values.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const span = max - min || 1;
  const n = c.values.length;
  const points: SparkPoint[] = [];
  c.values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const x = pad + (n === 1 ? (w - pad * 2) / 2 : (i / (n - 1)) * (w - pad * 2));
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    points.push({ x, y, raw: v });
  });
  return {
    type: 'line',
    width: w,
    height: h,
    line: points,
    bars: [],
    color: c.color!,
    negativeColor: c.negativeColor!,
  };
}

function layoutColumns(c: SparkConfig): SparkLayout {
  const pad = c.padding ?? 1;
  const w = c.width;
  const h = c.height;
  const finite = c.values.filter((v) => Number.isFinite(v));
  const min = Math.min(0, ...(finite.length ? finite : [0]));
  const max = Math.max(0, ...(finite.length ? finite : [1]));
  const span = max - min || 1;
  const zeroY = pad + ((max - 0) / span) * (h - pad * 2);
  const n = c.values.length || 1;
  const slotW = Math.max(1, (w - pad * 2) / n);
  const barW = Math.max(1, slotW - 1);
  const bars: SparkLayout['bars'] = [];
  c.values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const x = pad + i * slotW + (slotW - barW) / 2;
    const topV = v >= 0 ? v : 0;
    const botV = v >= 0 ? 0 : v;
    const topY = pad + ((max - topV) / span) * (h - pad * 2);
    const botY = pad + ((max - botV) / span) * (h - pad * 2);
    bars.push({ x, y: topY, w: barW, h: Math.max(0.5, botY - topY), positive: v >= 0, zero: v === 0 });
  });
  return {
    type: 'column',
    width: w,
    height: h,
    line: [{ x: 0, y: zeroY, raw: 0 }, { x: w, y: zeroY, raw: 0 }],
    bars,
    color: c.color!,
    negativeColor: c.negativeColor!,
  };
}

function layoutWinLoss(c: SparkConfig): SparkLayout {
  const pad = c.padding ?? 1;
  const w = c.width;
  const h = c.height;
  const n = c.values.length || 1;
  const slotW = Math.max(1, (w - pad * 2) / n);
  const barW = Math.max(1, slotW - 1);
  const halfH = (h - pad * 2) / 2;
  const zeroY = pad + halfH;
  const bars: SparkLayout['bars'] = [];
  c.values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const x = pad + i * slotW + (slotW - barW) / 2;
    if (v === 0) {
      bars.push({ x, y: zeroY - 0.5, w: barW, h: 1, positive: true, zero: true });
    } else if (v > 0) {
      bars.push({ x, y: pad, w: barW, h: halfH - 1, positive: true, zero: false });
    } else {
      bars.push({ x, y: zeroY + 1, w: barW, h: halfH - 1, positive: false, zero: false });
    }
  });
  return {
    type: 'winloss',
    width: w,
    height: h,
    line: [],
    bars,
    color: c.color!,
    negativeColor: c.negativeColor!,
  };
}

/** Render a sparkline to a self-contained SVG markup string. */
export function renderSparklineSvg(spark: Sparkline, values: number[], width = 96, height = 20): string {
  const layout = computeSparkline(spark, values, width, height);
  const parts: string[] = [];
  if (layout.type === 'line') {
    if (layout.line.length > 0) {
      const d = layout.line.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)},${num(p.y)}`).join(' ');
      parts.push(`<path d="${d}" fill="none" stroke="${layout.color}" stroke-width="1.25"/>`);
    }
  } else {
    for (const b of layout.bars) {
      const fill = b.positive ? layout.color : layout.negativeColor;
      parts.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(width)}" height="${num(height)}">${parts.join('')}</svg>`;
}

function num(v: number): string {
  return Number.isFinite(v) ? Number(v.toFixed(2)).toString() : '0';
}
