import { isErrorValue, makeError, toBool } from '../../cell';
import type { FnValue } from '../registry';
import { asBool, asScalar, iterScalars, register } from '../registry';

export function installLogical(): void {
  register('TRUE', () => true);
  register('FALSE', () => false);

  register('NOT', (args) => {
    const v = asBool(args[0] ?? false);
    if (typeof v !== 'boolean') return v;
    return !v;
  });

  register('AND', (args) => {
    let seen = false;
    for (const a of args) {
      for (const v of iterScalars(a)) {
        if (isErrorValue(v)) return v;
        const b = toBool(v);
        if (isErrorValue(b)) return b;
        if (!b) return false;
        seen = true;
      }
    }
    return seen;
  });

  register('OR', (args) => {
    for (const a of args) {
      for (const v of iterScalars(a)) {
        if (isErrorValue(v)) return v;
        const b = toBool(v);
        if (isErrorValue(b)) return b;
        if (b) return true;
      }
    }
    return false;
  });

  register('XOR', (args) => {
    let count = 0;
    for (const a of args) {
      for (const v of iterScalars(a)) {
        const b = toBool(v);
        if (isErrorValue(b)) return b;
        if (b) count++;
      }
    }
    return count % 2 === 1;
  });

  register('IF', (args) => {
    if (args.length < 2) return makeError('#N/A');
    const cond = asBool(args[0]!);
    if (isErrorValue(cond)) return cond;
    return cond ? args[1]! : (args[2] ?? false);
  });

  register('IFS', (args) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const cond = asBool(args[i]!);
      if (isErrorValue(cond)) return cond;
      if (cond) return args[i + 1]!;
    }
    return makeError('#N/A');
  });

  register('IFERROR', (args) => {
    const v = asScalar(args[0] ?? null);
    if (isErrorValue(v)) return args[1] ?? null;
    return args[0] ?? null;
  });

  register('IFNA', (args) => {
    const v = asScalar(args[0] ?? null);
    if (isErrorValue(v) && v.code === '#N/A') return args[1] ?? null;
    return args[0] ?? null;
  });

  register('SWITCH', (args) => {
    const expr = asScalar(args[0] ?? null);
    for (let i = 1; i + 1 < args.length; i += 2) {
      if (equals(expr, asScalar(args[i]!))) return args[i + 1]!;
    }
    // Default (odd final arg).
    if ((args.length - 1) % 2 === 1) return args[args.length - 1]! as FnValue;
    return makeError('#N/A');
  });
}

function equals(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  return String(a) === String(b);
}
