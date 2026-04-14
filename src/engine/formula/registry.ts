/**
 * Function registry. Each function receives already-evaluated arguments as
 * `Scalar | ArrayValue` and returns a `Scalar | ArrayValue`.
 *
 * Helpers in this file handle iterating ranges/arrays, coercion, and basic
 * error propagation. Category files register their functions via `register()`.
 */

import type { ArrayValue, Scalar } from '../cell';
import { isErrorValue, makeError, toBool, toNumber, toText } from '../cell';
import type { EvalContext } from './eval-context';

export type FnValue = Scalar | ArrayValue;

export type FnImpl = (args: FnValue[], ctx: EvalContext) => FnValue;

const registry = new Map<string, FnImpl>();

export function register(name: string, fn: FnImpl): void {
  registry.set(name.toUpperCase(), fn);
}

export function lookup(name: string): FnImpl | undefined {
  return registry.get(name.toUpperCase());
}

export function registeredNames(): string[] {
  return Array.from(registry.keys()).sort();
}

// --- Helpers ---------------------------------------------------------

/** Iterate every scalar inside a possibly-nested value, dropping blanks if requested. */
export function* iterScalars(v: FnValue, opts: { includeBlank?: boolean } = {}): Generator<Scalar> {
  if (Array.isArray(v)) {
    for (const row of v) {
      for (const cell of row) {
        if (cell === null || cell === '') {
          if (opts.includeBlank) yield cell;
          continue;
        }
        yield cell;
      }
    }
  } else {
    if (v === null || v === '') {
      if (opts.includeBlank) yield v;
      return;
    }
    yield v;
  }
}

export function flattenNumbers(args: FnValue[]): { nums: number[]; err?: Scalar } {
  const out: number[] = [];
  for (const a of args) {
    for (const v of iterScalars(a)) {
      if (isErrorValue(v)) return { nums: out, err: v };
      if (typeof v === 'number') out.push(v);
      else if (typeof v === 'boolean') out.push(v ? 1 : 0);
      // Strings are ignored (Excel SUM/AVERAGE skips strings in ranges).
    }
  }
  return { nums: out };
}

/** Coerce any FnValue to a single scalar, falling back to first scalar of an array. */
export function asScalar(v: FnValue): Scalar {
  if (Array.isArray(v)) {
    if (v.length === 0 || v[0]!.length === 0) return null;
    return v[0]![0]!;
  }
  return v;
}

export function asNumber(v: FnValue): number | ReturnType<typeof makeError> {
  const s = asScalar(v);
  return toNumber(s);
}

export function asBool(v: FnValue): boolean | ReturnType<typeof makeError> {
  return toBool(asScalar(v));
}

export function asText(v: FnValue): string {
  return toText(asScalar(v));
}

export function numericBinary(
  a: FnValue,
  b: FnValue,
  f: (x: number, y: number) => number,
): Scalar {
  const x = asNumber(a);
  if (typeof x !== 'number') return x;
  const y = asNumber(b);
  if (typeof y !== 'number') return y;
  const r = f(x, y);
  if (!Number.isFinite(r)) return makeError('#NUM!');
  return r;
}

export function propagateErrors(args: FnValue[]): Scalar | undefined {
  for (const a of args) {
    for (const v of iterScalars(a)) {
      if (isErrorValue(v)) return v;
    }
  }
  return undefined;
}

/** Require exactly `n` arguments; otherwise return #VALUE!. */
export function requireArgs(args: FnValue[], min: number, max = min): Scalar | undefined {
  if (args.length < min || args.length > max) return makeError('#N/A', 'wrong arg count');
  return undefined;
}
