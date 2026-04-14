import { makeError, isErrorValue } from '../../cell';
import { asNumber, flattenNumbers, iterScalars, lookup, register } from '../registry';
import { matches } from './math';

export function installStats(): void {
  register('AVERAGE', (args) => {
    const { nums } = flattenNumbers(args);
    if (nums.length === 0) return makeError('#DIV/0!');
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  });

  register('MIN', (args) => {
    const { nums } = flattenNumbers(args);
    return nums.length === 0 ? 0 : Math.min(...nums);
  });
  register('MAX', (args) => {
    const { nums } = flattenNumbers(args);
    return nums.length === 0 ? 0 : Math.max(...nums);
  });

  register('MEDIAN', (args) => {
    const { nums } = flattenNumbers(args);
    if (nums.length === 0) return makeError('#NUM!');
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  });

  register('MODE', (args) => {
    const { nums } = flattenNumbers(args);
    if (nums.length === 0) return makeError('#N/A');
    const counts = new Map<number, number>();
    let best: number | undefined;
    let bestCount = 0;
    for (const n of nums) {
      const c = (counts.get(n) ?? 0) + 1;
      counts.set(n, c);
      if (c > bestCount) {
        bestCount = c;
        best = n;
      }
    }
    return bestCount > 1 ? best! : makeError('#N/A');
  });

  register('COUNT', (args) => {
    let n = 0;
    for (const a of args) {
      for (const v of iterScalars(a)) if (typeof v === 'number') n++;
    }
    return n;
  });

  register('COUNTA', (args) => {
    let n = 0;
    for (const a of args) {
      for (const v of iterScalars(a, { includeBlank: false })) {
        if (v !== null && v !== '') n++;
      }
    }
    return n;
  });

  register('COUNTBLANK', (args) => {
    let n = 0;
    for (const a of args) {
      for (const v of iterScalars(a, { includeBlank: true })) {
        if (v === null || v === '') n++;
      }
    }
    return n;
  });

  register('COUNTIF', (args) => {
    const range = args[0]!;
    const crit = args[1]!;
    let n = 0;
    for (const v of iterScalars(range, { includeBlank: true })) {
      if (matches(v, crit)) n++;
    }
    return n;
  });

  register('COUNTIFS', (args) => {
    const arrays: Array<(number | string | boolean | null)[]> = [];
    for (let i = 0; i < args.length; i += 2) {
      arrays.push(flatScalarList(args[i]!));
    }
    const len = arrays[0]?.length ?? 0;
    let n = 0;
    outer: for (let i = 0; i < len; i++) {
      for (let k = 0; k < arrays.length; k++) {
        const crit = args[k * 2 + 1]!;
        if (!matches(arrays[k]![i] ?? null, crit)) continue outer;
      }
      n++;
    }
    return n;
  });

  register('AVERAGEIF', (args) => {
    const range = args[0]!;
    const crit = args[1]!;
    const avgRange = args[2] ?? range;
    const vals = flatScalarList(range);
    const avgVals = flatScalarList(avgRange);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < vals.length; i++) {
      if (matches(vals[i] ?? null, crit)) {
        const v = avgVals[i];
        if (typeof v === 'number') {
          sum += v;
          n++;
        }
      }
    }
    return n === 0 ? makeError('#DIV/0!') : sum / n;
  });

  register('AVERAGEIFS', (args) => {
    const avgRange = flatScalarList(args[0]!);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < avgRange.length; i++) {
      let ok = true;
      for (let p = 1; p + 1 < args.length; p += 2) {
        const rng = flatScalarList(args[p]!);
        if (!matches(rng[i] ?? null, args[p + 1]!)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const v = avgRange[i];
        if (typeof v === 'number') {
          sum += v;
          n++;
        }
      }
    }
    return n === 0 ? makeError('#DIV/0!') : sum / n;
  });

  register('STDEV', (args) => stdev(args, true));
  register('STDEVP', (args) => stdev(args, false));
  register('VAR', (args) => variance(args, true));
  register('VARP', (args) => variance(args, false));

  register('LARGE', (args) => {
    const { nums } = flattenNumbers([args[0]!]);
    const k = asNumber(args[1] ?? 1);
    if (typeof k !== 'number' || k < 1 || k > nums.length) return makeError('#NUM!');
    return nums.sort((a, b) => b - a)[Math.floor(k) - 1]!;
  });
  register('SMALL', (args) => {
    const { nums } = flattenNumbers([args[0]!]);
    const k = asNumber(args[1] ?? 1);
    if (typeof k !== 'number' || k < 1 || k > nums.length) return makeError('#NUM!');
    return nums.sort((a, b) => a - b)[Math.floor(k) - 1]!;
  });
  register('RANK', (args) => {
    const v = asNumber(args[0] ?? 0);
    const { nums } = flattenNumbers([args[1]!]);
    const asc = args.length > 2 ? (asNumber(args[2]!) as number) !== 0 : false;
    if (typeof v !== 'number') return v;
    const sorted = [...nums].sort(asc ? (a, b) => a - b : (a, b) => b - a);
    const idx = sorted.indexOf(v);
    return idx < 0 ? makeError('#N/A') : idx + 1;
  });

  register('PERCENTILE', (args) => {
    const { nums } = flattenNumbers([args[0]!]);
    const p = asNumber(args[1] ?? 0);
    if (typeof p !== 'number' || p < 0 || p > 1) return makeError('#NUM!');
    if (nums.length === 0) return makeError('#NUM!');
    const sorted = [...nums].sort((a, b) => a - b);
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
  });
  register('QUARTILE', (args, ctx) => {
    const q = asNumber(args[1] ?? 0);
    if (typeof q !== 'number') return q;
    const p = Math.max(0, Math.min(4, Math.floor(q))) / 4;
    const percentile = lookup('PERCENTILE');
    return percentile ? percentile([args[0]!, p], ctx) : makeError('#NAME?');
  });

  register('CORREL', (args) => correlate(args));
  register('COVAR', (args) => covariance(args, false));

  register('SLOPE', (args) => regression(args, 'slope'));
  register('INTERCEPT', (args) => regression(args, 'intercept'));
  register('FORECAST', (args) => {
    const x = asNumber(args[0] ?? 0);
    if (typeof x !== 'number') return x;
    const slope = regression([args[1]!, args[2]!], 'slope');
    const intercept = regression([args[1]!, args[2]!], 'intercept');
    if (typeof slope !== 'number' || typeof intercept !== 'number') return makeError('#N/A');
    return intercept + slope * x;
  });
  register('TREND', (args) => regression([args[0]!, args[1]!], 'slope'));
}

function stdev(args: any[], sample: boolean) {
  const v = variance(args, sample);
  if (typeof v !== 'number') return v;
  return Math.sqrt(v);
}

function variance(args: any[], sample: boolean) {
  const { nums } = flattenNumbers(args);
  const n = nums.length;
  if (n < (sample ? 2 : 1)) return makeError('#DIV/0!');
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const sq = nums.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return sq / (sample ? n - 1 : n);
}

function pairs(args: any[]): Array<[number, number]> {
  const a = flattenNumbers([args[0]!]).nums;
  const b = flattenNumbers([args[1]!]).nums;
  const len = Math.min(a.length, b.length);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) out.push([a[i]!, b[i]!]);
  return out;
}

function correlate(args: any[]) {
  const ps = pairs(args);
  if (ps.length < 2) return makeError('#DIV/0!');
  const mx = ps.reduce((s, [x]) => s + x, 0) / ps.length;
  const my = ps.reduce((s, [, y]) => s + y, 0) / ps.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of ps) {
    num += (x - mx) * (y - my);
    dx += (x - mx) * (x - mx);
    dy += (y - my) * (y - my);
  }
  if (dx === 0 || dy === 0) return makeError('#DIV/0!');
  return num / Math.sqrt(dx * dy);
}

function covariance(args: any[], sample: boolean) {
  const ps = pairs(args);
  if (ps.length < (sample ? 2 : 1)) return makeError('#DIV/0!');
  const mx = ps.reduce((s, [x]) => s + x, 0) / ps.length;
  const my = ps.reduce((s, [, y]) => s + y, 0) / ps.length;
  const num = ps.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  return num / (sample ? ps.length - 1 : ps.length);
}

function regression(args: any[], which: 'slope' | 'intercept') {
  // args[0] = known_y, args[1] = known_x (Excel ordering).
  const ys = flattenNumbers([args[0]!]).nums;
  const xs = flattenNumbers([args[1]!]).nums;
  const len = Math.min(xs.length, ys.length);
  if (len < 2) return makeError('#DIV/0!');
  const mx = xs.slice(0, len).reduce((a, b) => a + b, 0) / len;
  const my = ys.slice(0, len).reduce((a, b) => a + b, 0) / len;
  let num = 0;
  let den = 0;
  for (let i = 0; i < len; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  if (den === 0) return makeError('#DIV/0!');
  const slope = num / den;
  return which === 'slope' ? slope : my - slope * mx;
}

function flatScalarList(v: any): Array<number | string | boolean | null> {
  const out: Array<number | string | boolean | null> = [];
  for (const s of iterScalars(v, { includeBlank: true })) {
    if (isErrorValue(s)) out.push(null);
    else out.push(s as any);
  }
  return out;
}
