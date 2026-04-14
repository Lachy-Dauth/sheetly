import type { ArrayValue, Scalar } from '../../cell';
import { makeError } from '../../cell';
import type { FnValue } from '../registry';
import { asNumber, register } from '../registry';

export function installArrays(): void {
  register('SEQUENCE', (args) => {
    const rows = asNumber(args[0] ?? 1);
    const cols = args.length > 1 ? asNumber(args[1]!) : 1;
    const start = args.length > 2 ? asNumber(args[2]!) : 1;
    const step = args.length > 3 ? asNumber(args[3]!) : 1;
    if (typeof rows !== 'number' || typeof cols !== 'number' || typeof start !== 'number' || typeof step !== 'number')
      return makeError('#VALUE!');
    const out: ArrayValue = [];
    let v = start;
    for (let r = 0; r < rows; r++) {
      const row: Scalar[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(v);
        v += step;
      }
      out.push(row);
    }
    return out;
  });

  register('RANDARRAY', (args) => {
    const rows = args.length > 0 ? asNumber(args[0]!) : 1;
    const cols = args.length > 1 ? asNumber(args[1]!) : 1;
    const min = args.length > 2 ? asNumber(args[2]!) : 0;
    const max = args.length > 3 ? asNumber(args[3]!) : 1;
    const integer = args.length > 4 ? asNumber(args[4]!) !== 0 : false;
    if (
      typeof rows !== 'number' ||
      typeof cols !== 'number' ||
      typeof min !== 'number' ||
      typeof max !== 'number'
    )
      return makeError('#VALUE!');
    const out: ArrayValue = [];
    for (let r = 0; r < rows; r++) {
      const row: Scalar[] = [];
      for (let c = 0; c < cols; c++) {
        const v = Math.random() * (max - min) + min;
        row.push(integer ? Math.floor(v) : v);
      }
      out.push(row);
    }
    return out;
  });

  register('UNIQUE', (args) => {
    const a = asArray(args[0] ?? null);
    if (!a) return [];
    const seen = new Set<string>();
    const out: Scalar[][] = [];
    for (const row of a) {
      const key = row.map((c) => `${typeof c}:${c}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([...row]);
    }
    return out;
  });

  register('SORT', (args) => {
    const a = asArray(args[0] ?? null);
    if (!a) return [];
    const sortIndex = args.length > 1 ? (asNumber(args[1]!) as number) - 1 : 0;
    const asc = args.length > 2 ? (asNumber(args[2]!) as number) >= 0 : true;
    const out = [...a.map((r) => [...r])];
    out.sort((x, y) => {
      const xv = x[sortIndex] ?? null;
      const yv = y[sortIndex] ?? null;
      return compare(xv, yv) * (asc ? 1 : -1);
    });
    return out;
  });

  register('FILTER', (args) => {
    const a = asArray(args[0] ?? null);
    const include = asArray(args[1] ?? null);
    if (!a || !include) return [];
    const flat = include.flat();
    const out: Scalar[][] = [];
    for (let i = 0; i < a.length; i++) {
      if (flat[i]) out.push([...a[i]!]);
    }
    if (out.length === 0) return args.length > 2 ? (args[2] as FnValue) : makeError('#N/A');
    return out;
  });
}

function asArray(v: FnValue): ArrayValue | null {
  if (Array.isArray(v)) return v;
  return [[v]];
}

function compare(a: Scalar, b: Scalar): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}
