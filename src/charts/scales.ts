/**
 * Pure math helpers for chart axis scales and tick generation.
 * No DOM — safe to import from engine, UI, or tests.
 */

export interface LinearScale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  invert: (y: number) => number;
}

/**
 * Generate "nice" tick marks in roughly `count` steps.
 * Ported from d3-array's niceTicks algorithm, simplified.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    if (min === 0) return [0, 1];
    return [min - Math.abs(min) * 0.1, min + Math.abs(min) * 0.1];
  }
  if (count <= 0) return [min, max];
  const span = max - min;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))));
  const norm = rawStep / mag;
  let niceNorm: number;
  if (norm < 1.5) niceNorm = 1;
  else if (norm < 3) niceNorm = 2;
  else if (norm < 7) niceNorm = 5;
  else niceNorm = 10;
  const step = niceNorm * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) {
    ticks.push(roundToPrecision(v, step));
  }
  return ticks;
}

function roundToPrecision(value: number, step: number): number {
  // Step may be 0.1, 0.01, …; normalise floating-point drift to the step's digits.
  const digits = Math.max(0, Math.ceil(-Math.log10(step))) + 1;
  return Number(value.toFixed(digits));
}

export function linearScale(
  dataMin: number,
  dataMax: number,
  rangeStart: number,
  rangeEnd: number,
  opts: { tickCount?: number; padFraction?: number; forceMin?: number; forceMax?: number } = {},
): LinearScale {
  const pad = opts.padFraction ?? 0;
  let min = dataMin;
  let max = dataMax;
  if (min === max) {
    if (min === 0) {
      min = -1;
      max = 1;
    } else {
      min -= Math.abs(min) * 0.1;
      max += Math.abs(max) * 0.1;
    }
  } else {
    const p = (max - min) * pad;
    min -= p;
    max += p;
  }
  const ticks = niceTicks(min, max, opts.tickCount ?? 5);
  const domainMin = opts.forceMin ?? ticks[0] ?? min;
  const domainMax = opts.forceMax ?? ticks[ticks.length - 1] ?? max;
  const span = domainMax - domainMin || 1;
  const scale = ((v: number) =>
    rangeStart + ((v - domainMin) / span) * (rangeEnd - rangeStart)) as LinearScale;
  scale.domain = [domainMin, domainMax];
  scale.range = [rangeStart, rangeEnd];
  scale.ticks = ticks;
  scale.invert = (y: number) =>
    domainMin + ((y - rangeStart) / (rangeEnd - rangeStart)) * span;
  return scale;
}

/** Compute min/max across a matrix of numeric values, ignoring nulls. */
export function valueExtent(values: readonly (readonly (number | null)[])[]): {
  min: number;
  max: number;
} {
  let min = Infinity;
  let max = -Infinity;
  for (const row of values) {
    for (const v of row) {
      if (v === null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}

/** Column-by-column sum for stacked charts. */
export function stackExtent(series: readonly (readonly (number | null)[])[]): {
  min: number;
  max: number;
} {
  if (series.length === 0) return { min: 0, max: 1 };
  const n = series[0]!.length;
  let min = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    for (const row of series) {
      const v = row[i];
      if (v === null || !Number.isFinite(v ?? NaN)) continue;
      if ((v as number) >= 0) pos += v as number;
      else neg += v as number;
    }
    if (pos > max) max = pos;
    if (neg < min) min = neg;
  }
  return { min, max };
}
