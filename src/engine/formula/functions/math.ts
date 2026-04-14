import { makeError } from '../../cell';
import type { FnValue } from '../registry';
import {
  asNumber,
  asText,
  flattenNumbers,
  iterScalars,
  numericBinary,
  propagateErrors,
  register,
} from '../registry';

export function installMath(): void {
  register('SUM', (args) => {
    const err = propagateErrors(args);
    if (err) return err;
    const { nums } = flattenNumbers(args);
    return nums.reduce((a, b) => a + b, 0);
  });

  register('PRODUCT', (args) => {
    const { nums } = flattenNumbers(args);
    return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
  });

  register('ABS', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.abs(x)));
  register('SIGN', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.sign(x)));
  register('SQRT', (args) => numericBinary(args[0] ?? 0, 0, (x) => (x < 0 ? NaN : Math.sqrt(x))));
  register('POWER', (args) => numericBinary(args[0] ?? 0, args[1] ?? 0, (a, b) => Math.pow(a, b)));
  register('EXP', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.exp(x)));
  register('LN', (args) => numericBinary(args[0] ?? 0, 0, (x) => (x <= 0 ? NaN : Math.log(x))));
  register('LOG10', (args) => numericBinary(args[0] ?? 0, 0, (x) => (x <= 0 ? NaN : Math.log10(x))));
  register('LOG', (args) => {
    const n = asNumber(args[0] ?? 0);
    if (typeof n !== 'number') return n;
    if (n <= 0) return makeError('#NUM!');
    if (args.length < 2) return Math.log10(n);
    const base = asNumber(args[1]!);
    if (typeof base !== 'number') return base;
    if (base <= 0 || base === 1) return makeError('#NUM!');
    return Math.log(n) / Math.log(base);
  });

  register('SIN', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.sin(x)));
  register('COS', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.cos(x)));
  register('TAN', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.tan(x)));
  register('ASIN', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.asin(x)));
  register('ACOS', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.acos(x)));
  register('ATAN', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.atan(x)));
  register('ATAN2', (args) => numericBinary(args[0] ?? 0, args[1] ?? 0, (x, y) => Math.atan2(y, x)));
  register('DEGREES', (args) => numericBinary(args[0] ?? 0, 0, (x) => (x * 180) / Math.PI));
  register('RADIANS', (args) => numericBinary(args[0] ?? 0, 0, (x) => (x * Math.PI) / 180));
  register('PI', () => Math.PI);

  register('MOD', (args) => {
    const a = asNumber(args[0] ?? 0);
    const b = asNumber(args[1] ?? 0);
    if (typeof a !== 'number') return a;
    if (typeof b !== 'number') return b;
    if (b === 0) return makeError('#DIV/0!');
    return a - b * Math.floor(a / b);
  });

  register('ROUND', (args) => roundBy(args, (n, p) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p)));
  register('ROUNDUP', (args) =>
    roundBy(args, (n, p) => {
      const f = Math.pow(10, p);
      return n >= 0 ? Math.ceil(n * f) / f : Math.floor(n * f) / f;
    }),
  );
  register('ROUNDDOWN', (args) =>
    roundBy(args, (n, p) => {
      const f = Math.pow(10, p);
      return n >= 0 ? Math.floor(n * f) / f : Math.ceil(n * f) / f;
    }),
  );

  register('CEILING', (args) => {
    const n = asNumber(args[0] ?? 0);
    const m = asNumber(args[1] ?? 1);
    if (typeof n !== 'number') return n;
    if (typeof m !== 'number') return m;
    if (m === 0) return 0;
    return Math.ceil(n / m) * m;
  });
  register('FLOOR', (args) => {
    const n = asNumber(args[0] ?? 0);
    const m = asNumber(args[1] ?? 1);
    if (typeof n !== 'number') return n;
    if (typeof m !== 'number') return m;
    if (m === 0) return 0;
    return Math.floor(n / m) * m;
  });

  register('INT', (args) => numericBinary(args[0] ?? 0, 0, (x) => Math.floor(x)));
  register('TRUNC', (args) => {
    const n = asNumber(args[0] ?? 0);
    const d = args.length > 1 ? asNumber(args[1]!) : 0;
    if (typeof n !== 'number') return n;
    if (typeof d !== 'number') return d;
    const f = Math.pow(10, d);
    return (n >= 0 ? Math.floor(n * f) : Math.ceil(n * f)) / f;
  });

  register('RAND', () => Math.random());
  register('RANDBETWEEN', (args) => {
    const lo = asNumber(args[0] ?? 0);
    const hi = asNumber(args[1] ?? 0);
    if (typeof lo !== 'number') return lo;
    if (typeof hi !== 'number') return hi;
    return Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) + Math.ceil(lo);
  });

  register('GCD', (args) => {
    const { nums } = flattenNumbers(args);
    if (!nums.length) return 0;
    return nums.map((n) => Math.abs(Math.floor(n))).reduce((a, b) => (b === 0 ? a : gcd(a, b)));
  });
  register('LCM', (args) => {
    const { nums } = flattenNumbers(args);
    if (!nums.length) return 0;
    return nums.map((n) => Math.abs(Math.floor(n))).reduce((a, b) => (a * b) / gcd(a, b));
  });

  register('SUMIF', (args) => {
    const range = args[0]!;
    const criterion = args[1]!;
    const sumRange = args[2] ?? range;
    // `includeBlank` keeps both arrays aligned when the two ranges contain
    // blanks at different positions. Without this, the i-th criterion could
    // pair up with the wrong sum cell.
    const vals = [...iterScalars(range, { includeBlank: true })];
    const sumVals = [...iterScalars(sumRange, { includeBlank: true })];
    const len = Math.min(vals.length, sumVals.length);
    let total = 0;
    for (let i = 0; i < len; i++) {
      if (matches(vals[i] ?? null, criterion)) {
        const v = sumVals[i];
        if (typeof v === 'number') total += v;
      }
    }
    return total;
  });

  register('SUMIFS', (args) => {
    const sumRange = args[0]!;
    const sumVals = flatMatrix(sumRange);
    let total = 0;
    for (let i = 0; i < sumVals.length; i++) {
      let ok = true;
      for (let p = 1; p + 1 < args.length; p += 2) {
        const crit = args[p + 1]!;
        const check = flatMatrix(args[p]!)[i];
        if (!matches(check ?? null, crit)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const v = sumVals[i];
        if (typeof v === 'number') total += v;
      }
    }
    return total;
  });

  register('SUMPRODUCT', (args) => {
    if (args.length === 0) return 0;
    const arrays = args.map((a) => flatMatrix(a));
    const len = arrays[0]!.length;
    // Excel returns #VALUE! if any array has a different length than the first.
    for (const arr of arrays) {
      if (arr.length !== len) return makeError('#VALUE!');
    }
    let total = 0;
    for (let i = 0; i < len; i++) {
      let product = 1;
      for (const arr of arrays) {
        const v = arr[i];
        if (typeof v === 'number') product *= v;
        else if (typeof v === 'boolean') product *= v ? 1 : 0;
        else {
          product = 0;
          break;
        }
      }
      total += product;
    }
    return total;
  });
}

function roundBy(args: FnValue[], f: (n: number, p: number) => number) {
  const n = asNumber(args[0] ?? 0);
  const p = args.length > 1 ? asNumber(args[1]!) : 0;
  if (typeof n !== 'number') return n;
  if (typeof p !== 'number') return p;
  return f(n, p);
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function flatMatrix(v: FnValue): Array<number | string | boolean | null> {
  const out: Array<number | string | boolean | null> = [];
  for (const s of iterScalars(v, { includeBlank: true })) {
    if (s && typeof s === 'object' && 'kind' in s && s.kind === 'error') {
      out.push(null);
    } else {
      out.push(s as any);
    }
  }
  return out;
}

export function matches(value: unknown, criterion: FnValue): boolean {
  // Criterion may be a comparison like ">=5" or a literal.
  const c = Array.isArray(criterion) ? criterion[0]?.[0] : criterion;
  if (typeof c === 'string') {
    const m = c.match(/^\s*(<=|>=|<>|<|>|=)\s*(.*)$/);
    if (m) {
      const op = m[1]!;
      const rhs = m[2]!;
      const rhsNum = Number(rhs);
      const num = typeof value === 'number' ? value : null;
      if (Number.isFinite(rhsNum) && num !== null) {
        switch (op) {
          case '<=':
            return num <= rhsNum;
          case '>=':
            return num >= rhsNum;
          case '<>':
            return num !== rhsNum;
          case '<':
            return num < rhsNum;
          case '>':
            return num > rhsNum;
          case '=':
            return num === rhsNum;
        }
      }
      const lhsStr = value === null ? '' : String(value);
      switch (op) {
        case '<=':
          return lhsStr <= rhs;
        case '>=':
          return lhsStr >= rhs;
        case '<>':
          return lhsStr !== rhs;
        case '<':
          return lhsStr < rhs;
        case '>':
          return lhsStr > rhs;
        case '=':
          return lhsStr === rhs;
      }
    }
    // Wildcards * ? support.
    if (/[*?]/.test(c)) {
      const re = new RegExp(
        '^' + c.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        'i',
      );
      return re.test(String(value ?? ''));
    }
  }
  if (typeof c === 'number' && typeof value === 'number') return c === value;
  return String(value ?? '') === String(c ?? '');
}

export { asText };
