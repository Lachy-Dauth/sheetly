import type { Scalar } from '../../cell';
import { isErrorValue, makeError } from '../../cell';
import type { FnValue } from '../registry';
import { register } from '../registry';

export function installInfo(): void {
  register('ISBLANK', (args) => asScalar(args[0] ?? null) === null);
  register('ISNUMBER', (args) => typeof asScalar(args[0] ?? null) === 'number');
  register('ISTEXT', (args) => typeof asScalar(args[0] ?? null) === 'string');
  register('ISLOGICAL', (args) => typeof asScalar(args[0] ?? null) === 'boolean');
  register('ISERROR', (args) => isErrorValue(asScalar(args[0] ?? null)));
  register('ISNA', (args) => {
    const v = asScalar(args[0] ?? null);
    return isErrorValue(v) && v.code === '#N/A';
  });

  register('ISEVEN', (args) => {
    const n = asScalar(args[0] ?? 0);
    if (typeof n !== 'number') return makeError('#VALUE!');
    return Math.floor(Math.abs(n)) % 2 === 0;
  });
  register('ISODD', (args) => {
    const n = asScalar(args[0] ?? 0);
    if (typeof n !== 'number') return makeError('#VALUE!');
    return Math.floor(Math.abs(n)) % 2 === 1;
  });

  register('TYPE', (args) => {
    const v = asScalar(args[0] ?? null);
    if (typeof v === 'number') return 1;
    if (typeof v === 'string') return 2;
    if (typeof v === 'boolean') return 4;
    if (isErrorValue(v)) return 16;
    return 64;
  });

  register('N', (args) => {
    const v = asScalar(args[0] ?? 0);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErrorValue(v)) return v;
    return 0;
  });

  register('NA', () => makeError('#N/A'));

  register('CELL', (args) => {
    const info = String(asScalar(args[0] ?? 'value'));
    if (info === 'format') return 'G';
    if (info === 'type') return 'v';
    return asScalar(args[1] ?? null);
  });
  register('INFO', (args) => {
    const v = String(asScalar(args[0] ?? ''));
    if (v === 'system') return typeof navigator !== 'undefined' ? navigator.platform : 'web';
    if (v === 'release') return '1.0';
    return '';
  });
}

function asScalar(v: FnValue): Scalar {
  if (Array.isArray(v)) return v[0]?.[0] ?? null;
  return v;
}
