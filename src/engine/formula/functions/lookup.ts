import { isErrorValue, makeError } from '../../cell';
import type { ArrayValue, Scalar } from '../../cell';
import type { FnValue } from '../registry';
import { asNumber, asText, register } from '../registry';

export function installLookup(): void {
  register('ROW', (args, ctx) => {
    if (args.length === 0) return ctx.cell.row + 1;
    const v = args[0]!;
    if (Array.isArray(v)) return ctx.cell.row + 1;
    return ctx.cell.row + 1;
  });
  register('COLUMN', (_args, ctx) => ctx.cell.col + 1);

  register('ROWS', (args) => {
    const v = args[0]!;
    return Array.isArray(v) ? v.length : 1;
  });
  register('COLUMNS', (args) => {
    const v = args[0]!;
    return Array.isArray(v) ? v[0]?.length ?? 0 : 1;
  });

  register('CHOOSE', (args) => {
    const idx = asNumber(args[0] ?? 0);
    if (typeof idx !== 'number') return idx;
    const i = Math.floor(idx);
    if (i < 1 || i >= args.length) return makeError('#VALUE!');
    return args[i]!;
  });

  register('VLOOKUP', (args) => {
    const key = asScalar(args[0] ?? null);
    const matrix = asArray(args[1] ?? null);
    const colIdx = asNumber(args[2] ?? 1);
    const approx = args.length > 3 ? toBoolLoose(args[3]!) : true;
    if (typeof colIdx !== 'number') return colIdx;
    if (!matrix || matrix.length === 0) return makeError('#N/A');
    const idx = Math.floor(colIdx) - 1;
    if (idx < 0) return makeError('#REF!');
    if (!approx) {
      for (const row of matrix) {
        if (row && compareEq(row[0] ?? null, key)) return row[idx] ?? null;
      }
      return makeError('#N/A');
    }
    // Approximate: largest <= key.
    let last: Scalar = makeError('#N/A');
    for (const row of matrix) {
      const v = row[0] ?? null;
      if (lt(v, key) || eq(v, key)) last = row[idx] ?? null;
      else break;
    }
    return last;
  });

  register('HLOOKUP', (args) => {
    const key = asScalar(args[0] ?? null);
    const matrix = asArray(args[1] ?? null);
    const rowIdx = asNumber(args[2] ?? 1);
    const approx = args.length > 3 ? toBoolLoose(args[3]!) : true;
    if (typeof rowIdx !== 'number') return rowIdx;
    if (!matrix || matrix.length === 0 || !matrix[0]) return makeError('#N/A');
    const idx = Math.floor(rowIdx) - 1;
    const head = matrix[0];
    if (idx < 0 || idx >= matrix.length) return makeError('#REF!');
    if (!approx) {
      for (let c = 0; c < head.length; c++) {
        if (compareEq(head[c] ?? null, key)) return matrix[idx]![c] ?? null;
      }
      return makeError('#N/A');
    }
    let match = -1;
    for (let c = 0; c < head.length; c++) {
      const v = head[c] ?? null;
      if (lt(v, key) || eq(v, key)) match = c;
      else break;
    }
    return match < 0 ? makeError('#N/A') : matrix[idx]![match] ?? null;
  });

  register('INDEX', (args) => {
    const a = asArray(args[0] ?? null);
    const r = args.length > 1 ? asNumber(args[1]!) : 1;
    const c = args.length > 2 ? asNumber(args[2]!) : 1;
    if (!a) return makeError('#REF!');
    if (typeof r !== 'number') return r;
    if (typeof c !== 'number') return c;
    // Whole-column / whole-row indexing.
    if (r === 0) return a.map((row) => [row[Math.floor(c) - 1] ?? null]);
    if (c === 0) return [a[Math.floor(r) - 1] ?? []];
    return a[Math.floor(r) - 1]?.[Math.floor(c) - 1] ?? null;
  });

  register('MATCH', (args) => {
    const key = asScalar(args[0] ?? null);
    const list = asArray(args[1] ?? null);
    const mode = args.length > 2 ? asNumber(args[2]!) : 1;
    if (!list) return makeError('#N/A');
    const flat = list.flat();
    if (typeof mode !== 'number') return mode;
    if (mode === 0) {
      for (let i = 0; i < flat.length; i++) if (compareEq(flat[i] ?? null, key)) return i + 1;
      return makeError('#N/A');
    }
    if (mode === 1) {
      // Ascending: largest <= key.
      let idx = -1;
      for (let i = 0; i < flat.length; i++) {
        const v = flat[i] ?? null;
        if (lt(v, key) || eq(v, key)) idx = i;
        else break;
      }
      return idx < 0 ? makeError('#N/A') : idx + 1;
    }
    // -1 descending: smallest >= key.
    let idx = -1;
    for (let i = 0; i < flat.length; i++) {
      const v = flat[i] ?? null;
      if (gt(v, key) || eq(v, key)) idx = i;
      else break;
    }
    return idx < 0 ? makeError('#N/A') : idx + 1;
  });

  register('XMATCH', (args) => {
    const key = asScalar(args[0] ?? null);
    const list = asArray(args[1] ?? null);
    // match_mode: 0 exact (default), -1 exact-or-next-smaller, 1 exact-or-next-larger, 2 wildcard.
    const matchMode = args.length > 2 ? asNumber(args[2]!) : 0;
    // search_mode: 1 first→last (default), -1 last→first, 2/-2 binary search (treated as linear).
    const searchMode = args.length > 3 ? asNumber(args[3]!) : 1;
    if (typeof matchMode !== 'number') return matchMode;
    if (typeof searchMode !== 'number') return searchMode;
    if (!list) return makeError('#N/A');
    const flat = list.flat();
    const indices: number[] = [];
    for (let i = 0; i < flat.length; i++) indices.push(i);
    if (searchMode < 0) indices.reverse();
    const wildcardRe = matchMode === 2 ? wildcardToRegex(asText(key)) : null;
    let bestIdx = -1;
    let bestVal: Scalar = null;
    for (const i of indices) {
      const v = flat[i] ?? null;
      if (wildcardRe) {
        if (wildcardRe.test(asText(v))) return i + 1;
        continue;
      }
      if (compareEq(v, key)) return i + 1;
      if (matchMode === -1) {
        // Track largest value <= key.
        if (lt(v, key) && (bestIdx < 0 || lt(bestVal, v))) {
          bestIdx = i;
          bestVal = v;
        }
      } else if (matchMode === 1) {
        // Track smallest value >= key.
        if (gt(v, key) && (bestIdx < 0 || gt(bestVal, v))) {
          bestIdx = i;
          bestVal = v;
        }
      }
    }
    return bestIdx >= 0 ? bestIdx + 1 : makeError('#N/A');
  });

  register('XLOOKUP', (args) => {
    const key = asScalar(args[0] ?? null);
    const lookupArr = asArray(args[1] ?? null);
    const returnArr = asArray(args[2] ?? null);
    const ifNotFound = args.length > 3 ? args[3]! : makeError('#N/A');
    if (!lookupArr || !returnArr) return makeError('#N/A');
    const flatL = lookupArr.flat();
    for (let i = 0; i < flatL.length; i++) {
      if (compareEq(flatL[i] ?? null, key)) return returnArr.flat()[i] ?? null;
    }
    return ifNotFound;
  });

  register('OFFSET', (_args) => makeError('#N/A', 'OFFSET needs dynamic refs'));
  register('INDIRECT', (_args) => makeError('#N/A', 'INDIRECT needs dynamic refs'));

  register('TRANSPOSE', (args) => {
    const a = asArray(args[0] ?? null);
    if (!a || a.length === 0) return [];
    const rows = a.length;
    const cols = a[0]?.length ?? 0;
    const out: ArrayValue = [];
    for (let c = 0; c < cols; c++) {
      const row: Scalar[] = [];
      for (let r = 0; r < rows; r++) row.push(a[r]?.[c] ?? null);
      out.push(row);
    }
    return out;
  });

  register('HYPERLINK', (args) => asText(args.length > 1 ? args[1]! : args[0] ?? ''));
}

function asScalar(v: FnValue): Scalar {
  if (Array.isArray(v)) return v[0]?.[0] ?? null;
  return v;
}
function asArray(v: FnValue): ArrayValue | null {
  if (Array.isArray(v)) return v;
  return [[v]];
}
function toBoolLoose(v: FnValue): boolean {
  const s = asScalar(v);
  if (typeof s === 'boolean') return s;
  if (typeof s === 'number') return s !== 0;
  return String(s).toUpperCase() === 'TRUE';
}
function wildcardToRegex(pattern: string): RegExp {
  // Excel wildcards: * any chars, ? single char, ~* and ~? escape literals.
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '~' && (pattern[i + 1] === '*' || pattern[i + 1] === '?')) {
      out += pattern[i + 1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    } else if (c === '*') out += '.*';
    else if (c === '?') out += '.';
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

function compareEq(a: Scalar, b: Scalar): boolean {
  if (a === null && b === null) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a).toLowerCase() === String(b).toLowerCase();
}
function lt(a: Scalar, b: Scalar): boolean {
  if (isErrorValue(a) || isErrorValue(b)) return false;
  if (typeof a === 'number' && typeof b === 'number') return a < b;
  return String(a) < String(b);
}
function gt(a: Scalar, b: Scalar): boolean {
  if (isErrorValue(a) || isErrorValue(b)) return false;
  if (typeof a === 'number' && typeof b === 'number') return a > b;
  return String(a) > String(b);
}
function eq(a: Scalar, b: Scalar): boolean {
  return compareEq(a, b);
}
