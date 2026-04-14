/**
 * Trendline fitting utilities. Each fitter consumes matching x/y arrays and
 * returns a function that evaluates the fitted model at an arbitrary x.
 *
 *   linear : y = a + b·x                      (ordinary least squares)
 *   exp    : y = a·exp(b·x)                   (OLS on ln y)
 *   log    : y = a + b·ln x                   (OLS on ln x)
 *   poly2  : y = a + b·x + c·x²               (normal equations)
 *   poly3  : y = a + b·x + c·x² + d·x³        (normal equations)
 */

import type { TrendlineType } from '../engine/charts';

export interface TrendlineFit {
  kind: TrendlineType;
  predict: (x: number) => number;
  /** Coefficients in ascending order of x-power (a, b, c, …). */
  coeffs: number[];
  /** R² goodness-of-fit. */
  r2: number;
}

export function fitTrendline(
  xs: readonly number[],
  ys: readonly number[],
  kind: TrendlineType,
): TrendlineFit | null {
  const xy = pairsClean(xs, ys);
  if (xy.length < 2) return null;
  const cleanXs = xy.map((p) => p.x);
  const cleanYs = xy.map((p) => p.y);
  switch (kind) {
    case 'linear':
      return linear(cleanXs, cleanYs);
    case 'exp':
      return exponential(cleanXs, cleanYs);
    case 'log':
      return logarithmic(cleanXs, cleanYs);
    case 'poly2':
      return polynomial(cleanXs, cleanYs, 2);
    case 'poly3':
      return polynomial(cleanXs, cleanYs, 3);
    default:
      return null;
  }
}

function pairsClean(xs: readonly number[], ys: readonly number[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function linear(xs: number[], ys: number[]): TrendlineFit {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  const b = den === 0 ? 0 : num / den;
  const a = my - b * mx;
  const predict = (x: number) => a + b * x;
  return { kind: 'linear', coeffs: [a, b], predict, r2: rSquared(xs, ys, predict) };
}

function exponential(xs: number[], ys: number[]): TrendlineFit | null {
  const transformed: number[] = [];
  const kept: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]!;
    if (y <= 0) continue;
    transformed.push(Math.log(y));
    kept.push(xs[i]!);
  }
  if (transformed.length < 2) return null;
  const lin = linear(kept, transformed);
  const a = Math.exp(lin.coeffs[0]!);
  const b = lin.coeffs[1]!;
  const predict = (x: number) => a * Math.exp(b * x);
  return { kind: 'exp', coeffs: [a, b], predict, r2: rSquared(xs, ys, predict) };
}

function logarithmic(xs: number[], ys: number[]): TrendlineFit | null {
  const transformed: number[] = [];
  const kept: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    if (x <= 0) continue;
    transformed.push(Math.log(x));
    kept.push(ys[i]!);
  }
  if (transformed.length < 2) return null;
  const lin = linear(transformed, kept);
  const a = lin.coeffs[0]!;
  const b = lin.coeffs[1]!;
  const predict = (x: number) => (x <= 0 ? NaN : a + b * Math.log(x));
  return { kind: 'log', coeffs: [a, b], predict, r2: rSquared(xs, ys, predict) };
}

function polynomial(xs: number[], ys: number[], degree: 2 | 3): TrendlineFit | null {
  const m = degree + 1;
  // Build normal equations: (XᵀX) · β = Xᵀy  where X has columns x^0, x^1, …, x^degree.
  const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0) as number[]);
  const b: number[] = Array(m).fill(0) as number[];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    const row: number[] = Array(m).fill(1) as number[];
    for (let j = 1; j < m; j++) row[j] = row[j - 1]! * x;
    for (let r = 0; r < m; r++) {
      b[r]! += row[r]! * y;
      for (let c = 0; c < m; c++) A[r]![c]! += row[r]! * row[c]!;
    }
  }
  const coeffs = solveLinearSystem(A, b);
  if (!coeffs) return null;
  const predict = (x: number) => {
    let acc = 0;
    let pow = 1;
    for (const c of coeffs) {
      acc += c * pow;
      pow *= x;
    }
    return acc;
  };
  return {
    kind: degree === 2 ? 'poly2' : 'poly3',
    coeffs,
    predict,
    r2: rSquared(xs, ys, predict),
  };
}

/** Gauss-Jordan elimination with partial pivoting; returns null on singular matrix. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i++) {
    // Pivot selection
    let pivot = i;
    let max = Math.abs(M[i]![i]!);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(M[k]![i]!);
      if (v > max) {
        max = v;
        pivot = k;
      }
    }
    if (max < 1e-12) return null;
    if (pivot !== i) {
      const tmp = M[i]!;
      M[i] = M[pivot]!;
      M[pivot] = tmp;
    }
    const piv = M[i]![i]!;
    for (let j = i; j <= n; j++) M[i]![j]! /= piv;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k]![i]!;
      if (factor === 0) continue;
      for (let j = i; j <= n; j++) M[k]![j]! -= factor * M[i]![j]!;
    }
  }
  return M.map((row) => row[n]!);
}

function rSquared(xs: number[], ys: number[], predict: (x: number) => number): number {
  const n = ys.length;
  let sy = 0;
  for (const y of ys) sy += y;
  const my = sy / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const y = ys[i]!;
    const p = predict(xs[i]!);
    ssRes += (y - p) ** 2;
    ssTot += (y - my) ** 2;
  }
  if (ssTot === 0) return 1;
  return 1 - ssRes / ssTot;
}
