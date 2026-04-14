import { makeError, toText } from '../../cell';
import type { FnValue } from '../registry';
import { asNumber, asText, iterScalars, register } from '../registry';
import { formatValue } from '../../../grid/format';

export function installText(): void {
  register('CONCAT', (args) => {
    let out = '';
    for (const a of args) for (const v of iterScalars(a)) out += toText(v);
    return out;
  });
  register('CONCATENATE', (args) => args.map((a) => toText(asScalar(a))).join(''));

  register('TEXTJOIN', (args) => {
    const sep = asText(args[0] ?? '');
    const ignoreBlank = asNumber(args[1] ?? 1);
    const parts: string[] = [];
    for (let i = 2; i < args.length; i++) {
      for (const v of iterScalars(args[i]!, { includeBlank: true })) {
        if ((v === null || v === '') && ignoreBlank) continue;
        parts.push(toText(v));
      }
    }
    return parts.join(sep);
  });

  register('LEFT', (args) => {
    const s = asText(args[0] ?? '');
    const n = args.length > 1 ? asNumber(args[1]!) : 1;
    if (typeof n !== 'number') return n;
    return s.slice(0, Math.max(0, Math.floor(n)));
  });
  register('RIGHT', (args) => {
    const s = asText(args[0] ?? '');
    const n = args.length > 1 ? asNumber(args[1]!) : 1;
    if (typeof n !== 'number') return n;
    const m = Math.max(0, Math.floor(n));
    return m === 0 ? '' : s.slice(-m);
  });
  register('MID', (args) => {
    const s = asText(args[0] ?? '');
    const start = asNumber(args[1] ?? 1);
    const n = asNumber(args[2] ?? 0);
    if (typeof start !== 'number') return start;
    if (typeof n !== 'number') return n;
    return s.slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, n));
  });

  register('LEN', (args) => asText(args[0] ?? '').length);
  register('LOWER', (args) => asText(args[0] ?? '').toLowerCase());
  register('UPPER', (args) => asText(args[0] ?? '').toUpperCase());
  register('PROPER', (args) =>
    asText(args[0] ?? '')
      .toLowerCase()
      .replace(/(^|\W)([a-z])/g, (_m, p, c) => p + c.toUpperCase()),
  );
  register('TRIM', (args) => asText(args[0] ?? '').trim().replace(/\s+/g, ' '));
  register('CLEAN', (args) => asText(args[0] ?? '').replace(/[\x00-\x1F]/g, ''));

  register('SUBSTITUTE', (args) => {
    const s = asText(args[0] ?? '');
    const find = asText(args[1] ?? '');
    const rep = asText(args[2] ?? '');
    // `find` being empty would cause indexOf(..., idx) to return idx forever,
    // so short-circuit to match Excel's "no change" behaviour.
    if (find === '') return s;
    if (args.length > 3) {
      const n = asNumber(args[3]!);
      if (typeof n !== 'number') return n;
      let count = 0;
      let idx = 0;
      let out = '';
      while (idx <= s.length) {
        const next = s.indexOf(find, idx);
        if (next < 0) {
          out += s.slice(idx);
          break;
        }
        count++;
        if (count === Math.floor(n)) {
          out += s.slice(idx, next) + rep + s.slice(next + find.length);
          return out;
        }
        out += s.slice(idx, next + find.length);
        idx = next + find.length;
      }
      return out;
    }
    return s.split(find).join(rep);
  });

  register('REPLACE', (args) => {
    const s = asText(args[0] ?? '');
    const start = asNumber(args[1] ?? 1);
    const n = asNumber(args[2] ?? 0);
    const rep = asText(args[3] ?? '');
    if (typeof start !== 'number') return start;
    if (typeof n !== 'number') return n;
    const lo = Math.max(0, start - 1);
    return s.slice(0, lo) + rep + s.slice(lo + Math.max(0, n));
  });

  register('FIND', (args) => {
    const find = asText(args[0] ?? '');
    const inside = asText(args[1] ?? '');
    const start = args.length > 2 ? asNumber(args[2]!) : 1;
    if (typeof start !== 'number') return start;
    const idx = inside.indexOf(find, Math.max(0, start - 1));
    return idx < 0 ? makeError('#VALUE!') : idx + 1;
  });
  register('SEARCH', (args) => {
    const find = asText(args[0] ?? '').toLowerCase();
    const inside = asText(args[1] ?? '').toLowerCase();
    const start = args.length > 2 ? asNumber(args[2]!) : 1;
    if (typeof start !== 'number') return start;
    const idx = inside.indexOf(find, Math.max(0, start - 1));
    return idx < 0 ? makeError('#VALUE!') : idx + 1;
  });

  register('REPT', (args) => {
    const s = asText(args[0] ?? '');
    const n = asNumber(args[1] ?? 0);
    if (typeof n !== 'number') return n;
    return s.repeat(Math.max(0, Math.floor(n)));
  });

  register('EXACT', (args) => asText(args[0] ?? '') === asText(args[1] ?? ''));

  register('CHAR', (args) => {
    const n = asNumber(args[0] ?? 0);
    if (typeof n !== 'number') return n;
    return String.fromCharCode(Math.floor(n));
  });
  register('CODE', (args) => {
    const s = asText(args[0] ?? '');
    if (s.length === 0) return makeError('#VALUE!');
    return s.charCodeAt(0);
  });

  register('TEXT', (args) => {
    const v = asScalar(args[0] ?? null);
    const fmt = asText(args[1] ?? '');
    return formatValue(v as any, fmt);
  });

  register('VALUE', (args) => {
    const n = Number(asText(args[0] ?? ''));
    return Number.isFinite(n) ? n : makeError('#VALUE!');
  });

  register('SPLIT', (args) => {
    const s = asText(args[0] ?? '');
    const sep = asText(args[1] ?? ',');
    return [s.split(sep)];
  });

  register('REGEXMATCH', (args) => {
    const s = asText(args[0] ?? '');
    const re = asText(args[1] ?? '');
    try {
      return new RegExp(re).test(s);
    } catch {
      return makeError('#VALUE!');
    }
  });
  register('REGEXEXTRACT', (args) => {
    const s = asText(args[0] ?? '');
    const re = asText(args[1] ?? '');
    try {
      const m = new RegExp(re).exec(s);
      if (!m) return makeError('#N/A');
      return m[1] ?? m[0];
    } catch {
      return makeError('#VALUE!');
    }
  });
  register('REGEXREPLACE', (args) => {
    const s = asText(args[0] ?? '');
    const re = asText(args[1] ?? '');
    const rep = asText(args[2] ?? '');
    try {
      return s.replace(new RegExp(re, 'g'), rep);
    } catch {
      return makeError('#VALUE!');
    }
  });
}

function asScalar(v: FnValue) {
  if (Array.isArray(v)) return v[0]?.[0] ?? null;
  return v;
}
