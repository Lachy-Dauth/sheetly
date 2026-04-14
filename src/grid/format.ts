/**
 * Render a cell's displayed string given a value and optional number-format spec.
 * Keeps parity with the most common Excel format tokens: 0, #, ., ,, %, $, date parts.
 */

import type { Scalar } from '../engine/cell';
import { isErrorValue, toText } from '../engine/cell';
import { serialToDate } from '../engine/parse-input';

export function formatValue(value: Scalar | undefined, format?: string): string {
  if (value === null || value === undefined) return '';
  if (isErrorValue(value)) return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (!format || format === 'General' || format === 'general') {
    if (typeof value === 'number') return formatGeneralNumber(value);
    return toText(value);
  }
  if (typeof value === 'number') return applyFormat(value, format);
  return toText(value);
}

function formatGeneralNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e15)) return n.toExponential();
  return String(+n.toFixed(12)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

const DATE_PARTS = /\b(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p)\b/i;

function applyFormat(n: number, format: string): string {
  // Split by semicolons: pos;neg;zero;text
  const parts = splitSections(format);
  let section: string;
  if (parts.length === 1) section = parts[0]!;
  else if (n > 0) section = parts[0]!;
  else if (n < 0) section = parts[1] ?? parts[0]!;
  else section = parts[2] ?? parts[0]!;

  // Color token [Red], etc — stripped for display (renderer applies it separately).
  section = section.replace(/\[[^\]]*\]/g, '');

  if (DATE_PARTS.test(section)) {
    return formatDate(n, section);
  }
  if (section.includes('%')) return formatNumber(n * 100, section.replace('%', '')) + '%';
  return formatNumber(n, section);
}

function splitSections(format: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < format.length; i++) {
    const c = format[i]!;
    if (c === '"') inQuotes = !inQuotes;
    if (c === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function formatNumber(n: number, fmt: string): string {
  const m = fmt.match(/([#0,]*)(?:\.([#0]*))?/);
  if (!m) return String(n);
  const intPart = m[1] ?? '';
  const fracPart = m[2] ?? '';
  const useGrouping = intPart.includes(',');
  const intZeros = (intPart.match(/0/g) ?? []).length;
  const fracZeros = (fracPart.match(/0/g) ?? []).length;
  const fracMax = fracPart.length;

  const neg = n < 0;
  const abs = Math.abs(n);
  let fixed = abs.toFixed(fracMax);
  let [whole, decimals = ''] = fixed.split('.');
  // Trim trailing zeros down to fracZeros minimum.
  while (decimals.length > fracZeros && decimals.endsWith('0')) {
    decimals = decimals.slice(0, -1);
  }
  // Pad int with zeros.
  while (whole!.length < intZeros) whole = '0' + whole!;
  if (useGrouping) whole = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = whole!;
  if (decimals.length > 0) out += '.' + decimals;
  if (neg) out = '-' + out;
  // Preserve literal prefix/suffix ($ etc.) from the original format.
  const prefix = fmt.match(/^([^#0.]*)/)?.[1] ?? '';
  const suffix = fmt.match(/([^#0.,]*)$/)?.[1] ?? '';
  return prefix + out + suffix;
}

function formatDate(serial: number, fmt: string): string {
  const { y, m, d } = serialToDate(serial);
  const frac = serial - Math.floor(serial);
  const totalSeconds = Math.round(frac * 86400);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return fmt.replace(
    /yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s/gi,
    (tok) => {
      switch (tok.toLowerCase()) {
        case 'yyyy':
          return String(y);
        case 'yy':
          return pad(y % 100, 2);
        case 'mmmm':
          return monthFull[m - 1]!;
        case 'mmm':
          return monthNames[m - 1]!;
        case 'mm':
          return pad(m, 2);
        case 'm':
          return String(m);
        case 'dddd':
          return dayFull[dow]!;
        case 'ddd':
          return dayShort[dow]!;
        case 'dd':
          return pad(d, 2);
        case 'd':
          return String(d);
        case 'hh':
          return pad(hh, 2);
        case 'h':
          return String(hh);
        case 'ss':
          return pad(ss, 2);
        case 's':
          return String(ss);
        default:
          return tok;
      }
    },
  ).replace(/MM/g, pad(mm, 2));
}
