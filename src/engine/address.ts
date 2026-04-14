/**
 * Cell and range address utilities: A1 <-> {row,col} conversions,
 * range parsing, cross-sheet references, absolute/relative refs.
 */

export type Address = { row: number; col: number };
export type RangeAddress = { start: Address; end: Address; sheet?: string };

export type RefKind = 'cell' | 'range';

export interface ParsedRef {
  kind: RefKind;
  sheet?: string;
  start: Address;
  end: Address;
  absCol?: boolean;
  absRow?: boolean;
  absCol2?: boolean;
  absRow2?: boolean;
}

/** Convert a 0-based column index to letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function colToLetters(col: number): string {
  if (col < 0) throw new Error(`Invalid column: ${col}`);
  let out = '';
  let n = col + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Convert letters to 0-based column index: A -> 0, AA -> 26. */
export function lettersToCol(letters: string): number {
  let n = 0;
  const s = letters.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 65 || c > 90) throw new Error(`Invalid column letters: ${letters}`);
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

export function addressToA1({ row, col }: Address): string {
  return `${colToLetters(col)}${row + 1}`;
}

/** Parse a simple A1 address (no sheet, no absolute markers). */
export function a1ToAddress(a1: string): Address {
  const m = a1.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) throw new Error(`Invalid A1 address: ${a1}`);
  const col = lettersToCol(m[1]!);
  const row = parseInt(m[2]!, 10) - 1;
  if (row < 0) throw new Error(`Invalid A1 row: ${a1}`);
  return { row, col };
}

const REF_RE =
  /^(?:((?:'[^']*'|[A-Za-z_][\w. ]*))!)?(\$?)([A-Za-z]+)(\$?)(\d+)(?::(\$?)([A-Za-z]+)(\$?)(\d+))?$/;

/** Parse a full reference: optional sheet, absolute markers, optional range. */
export function parseRef(text: string): ParsedRef | null {
  const m = text.match(REF_RE);
  if (!m) return null;
  const sheetRaw = m[1];
  const sheet = sheetRaw
    ? sheetRaw.startsWith("'")
      ? sheetRaw.slice(1, -1).replace(/''/g, "'")
      : sheetRaw
    : undefined;
  const absCol = m[2] === '$';
  const colLetters = m[3]!;
  const absRow = m[4] === '$';
  const rowNum = parseInt(m[5]!, 10);
  const start: Address = { row: rowNum - 1, col: lettersToCol(colLetters) };
  if (m[6] === undefined) {
    return { kind: 'cell', sheet, start, end: start, absCol, absRow };
  }
  const absCol2 = m[6] === '$';
  const colLetters2 = m[7]!;
  const absRow2 = m[8] === '$';
  const rowNum2 = parseInt(m[9]!, 10);
  const end: Address = { row: rowNum2 - 1, col: lettersToCol(colLetters2) };
  return {
    kind: 'range',
    sheet,
    start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
    end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
    absCol,
    absRow,
    absCol2,
    absRow2,
  };
}

/** Encode/decode (row, col) as a single integer packed key for sparse Map. */
export function cellKey(row: number, col: number): number {
  // Supports up to 2^20 columns * 2^11 rows using 31 bits, safe as JS number key.
  return row * 16384 + col;
}

export function cellKeyOf({ row, col }: Address): number {
  return cellKey(row, col);
}

export function fromCellKey(key: number): Address {
  return { row: Math.floor(key / 16384), col: key % 16384 };
}

export function addressesEqual(a: Address, b: Address): boolean {
  return a.row === b.row && a.col === b.col;
}

export function inRange(r: RangeAddress, a: Address): boolean {
  return (
    a.row >= r.start.row && a.row <= r.end.row && a.col >= r.start.col && a.col <= r.end.col
  );
}

/** Iterate over every cell in a range (inclusive). */
export function* rangeCells(r: RangeAddress): Generator<Address> {
  for (let row = r.start.row; row <= r.end.row; row++) {
    for (let col = r.start.col; col <= r.end.col; col++) {
      yield { row, col };
    }
  }
}

export function normalizeRange(r: RangeAddress): RangeAddress {
  return {
    sheet: r.sheet,
    start: { row: Math.min(r.start.row, r.end.row), col: Math.min(r.start.col, r.end.col) },
    end: { row: Math.max(r.start.row, r.end.row), col: Math.max(r.start.col, r.end.col) },
  };
}

export function rangeToA1(r: RangeAddress): string {
  const prefix = r.sheet ? `${quoteSheet(r.sheet)}!` : '';
  if (addressesEqual(r.start, r.end)) return prefix + addressToA1(r.start);
  return `${prefix}${addressToA1(r.start)}:${addressToA1(r.end)}`;
}

export function quoteSheet(name: string): string {
  return /^[A-Za-z_][\w]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
