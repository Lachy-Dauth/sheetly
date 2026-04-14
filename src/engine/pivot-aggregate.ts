/** Numeric aggregators for pivot values. Each consumes raw Scalars. */

import type { PivotAggregate } from './pivots';
import type { Scalar } from './cell';
import { isErrorValue } from './cell';

export interface Aggregator {
  add(v: Scalar): void;
  result(): number | null;
}

export function createAggregator(kind: PivotAggregate): Aggregator {
  switch (kind) {
    case 'sum':
      return sumAgg();
    case 'count':
      return countAgg();
    case 'avg':
      return avgAgg();
    case 'min':
      return minAgg();
    case 'max':
      return maxAgg();
    case 'stdev':
      return stdevAgg(true);
    case 'var':
      return stdevAgg(false, true);
    case 'distinctCount':
      return distinctAgg();
  }
}

function toNum(v: Scalar): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErrorValue(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumAgg(): Aggregator {
  let sum = 0;
  let any = false;
  return {
    add(v) {
      const n = toNum(v);
      if (n !== null) {
        sum += n;
        any = true;
      }
    },
    result: () => (any ? sum : null),
  };
}

function countAgg(): Aggregator {
  let n = 0;
  return {
    add(v) {
      if (v !== null && v !== '') n++;
    },
    result: () => n,
  };
}

function avgAgg(): Aggregator {
  let sum = 0;
  let n = 0;
  return {
    add(v) {
      const x = toNum(v);
      if (x !== null) {
        sum += x;
        n++;
      }
    },
    result: () => (n === 0 ? null : sum / n),
  };
}

function minAgg(): Aggregator {
  let best: number | null = null;
  return {
    add(v) {
      const n = toNum(v);
      if (n === null) return;
      if (best === null || n < best) best = n;
    },
    result: () => best,
  };
}

function maxAgg(): Aggregator {
  let best: number | null = null;
  return {
    add(v) {
      const n = toNum(v);
      if (n === null) return;
      if (best === null || n > best) best = n;
    },
    result: () => best,
  };
}

/** Welford's online algorithm. Returns stdev or variance depending on flags. */
function stdevAgg(stdev = true, _ignored = false): Aggregator {
  let n = 0;
  let mean = 0;
  let m2 = 0;
  return {
    add(v) {
      const x = toNum(v);
      if (x === null) return;
      n++;
      const delta = x - mean;
      mean += delta / n;
      m2 += delta * (x - mean);
    },
    result: () => {
      if (n < 2) return null;
      const variance = m2 / (n - 1);
      return stdev ? Math.sqrt(variance) : variance;
    },
  };
}

function distinctAgg(): Aggregator {
  const seen = new Set<string>();
  return {
    add(v) {
      if (v === null || v === '') return;
      seen.add(keyForDistinct(v));
    },
    result: () => seen.size,
  };
}

function keyForDistinct(v: Scalar): string {
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v}`;
  if (isErrorValue(v)) return `e:${v.code}`;
  return `s:${String(v).toLowerCase()}`;
}
