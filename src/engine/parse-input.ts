/**
 * Parse raw text the user types into a cell. Produces a Cell with a raw value
 * and, for non-formula inputs, a pre-computed value. Formulas are evaluated
 * later by the runtime.
 */

import type { Cell } from './cell';

export function parseInput(input: string): Cell | undefined {
  if (input === '' || input === undefined || input === null) return undefined;
  // Formula.
  if (input.startsWith('=')) {
    return { raw: input };
  }
  const trimmed = input.trim();
  // Boolean.
  if (/^(TRUE|FALSE)$/i.test(trimmed)) {
    const v = /^TRUE$/i.test(trimmed);
    return { raw: v, value: v };
  }
  // Percentage.
  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
    const n = parseFloat(trimmed) / 100;
    return { raw: input, value: n, format: '0%' };
  }
  // Number (including scientific notation).
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed);
    if (Number.isFinite(n)) return { raw: n, value: n };
  }
  // Currency (very loose - any leading currency symbol then a number).
  const currencyMatch = trimmed.match(/^([$€£¥])\s*(-?\d+(?:[,\d]*)(?:\.\d+)?)$/);
  if (currencyMatch) {
    const n = parseFloat(currencyMatch[2]!.replace(/,/g, ''));
    if (Number.isFinite(n)) {
      return { raw: input, value: n, format: `${currencyMatch[1]}#,##0.00` };
    }
  }
  // Numbers with grouping commas: 1,234.56.
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed.replace(/,/g, ''));
    if (Number.isFinite(n)) return { raw: input, value: n, format: '#,##0.###' };
  }
  // Dates: YYYY-MM-DD or M/D/YYYY.
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const usd = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (iso || usd) {
    let y: number, m: number, d: number;
    if (iso) {
      y = +iso[1]!;
      m = +iso[2]!;
      d = +iso[3]!;
    } else {
      m = +usd![1]!;
      d = +usd![2]!;
      y = +usd![3]!;
      if (y < 100) y += y < 30 ? 2000 : 1900;
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const serial = dateToSerial(y, m, d);
      return { raw: input, value: serial, format: iso ? 'yyyy-mm-dd' : 'm/d/yyyy' };
    }
  }
  return { raw: input, value: input };
}

/** Convert (y,m,d) to a serial day count using 1900-01-01 as day 1 (Excel-compat). */
export function dateToSerial(y: number, m: number, d: number): number {
  // Excel treats 1900 as a leap year; we approximate by using 1899-12-30 as day 0.
  const base = Date.UTC(1899, 11, 30);
  const t = Date.UTC(y, m - 1, d);
  return Math.round((t - base) / 86400000);
}

export function serialToDate(serial: number): { y: number; m: number; d: number } {
  const base = Date.UTC(1899, 11, 30);
  const t = base + Math.floor(serial) * 86400000;
  const date = new Date(t);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}
