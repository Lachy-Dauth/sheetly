/**
 * Data tools: find & replace, sort, dedupe, text-to-columns, flash-fill (stub).
 * Each op produces a batch of `setCells` changes so undo/redo works via the
 * normal command pipeline.
 */

import type { Address, RangeAddress } from './address';
import { cellKey, normalizeRange } from './address';
import type { Cell, Scalar } from './cell';
import { toText } from './cell';
import type { Sheet } from './sheet';
import type { Workbook } from './workbook';
import { parseInput } from './parse-input';

export interface FindOptions {
  pattern: string;
  regex?: boolean;
  caseSensitive?: boolean;
  wholeCell?: boolean;
  /** When unset, searches the entire sheet. */
  range?: RangeAddress;
}

export interface FindMatch {
  address: Address;
  text: string;
  start: number;
  end: number;
}

/** Build a matching test function from the user-facing options. */
function compileMatcher(opts: FindOptions): (text: string) => FindMatch['start'][] {
  const flags = (opts.caseSensitive ? '' : 'i') + 'g';
  if (opts.regex) {
    const re = new RegExp(opts.pattern, flags);
    return (text) => {
      const out: number[] = [];
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        out.push(m.index);
        // Guard against zero-width matches.
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      return out;
    };
  }
  const needle = opts.caseSensitive ? opts.pattern : opts.pattern.toLowerCase();
  return (text) => {
    const hay = opts.caseSensitive ? text : text.toLowerCase();
    if (opts.wholeCell) return hay === needle ? [0] : [];
    const out: number[] = [];
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      out.push(i);
      i += needle.length || 1;
    }
    return out;
  };
}

function cellRawText(cell: Cell | undefined): string {
  if (!cell) return '';
  // Prefer raw user input for search so formulas are matched by source text.
  if (typeof cell.raw === 'string') return cell.raw;
  if (cell.raw === null) return '';
  return String(cell.raw);
}

export function findAll(sheet: Sheet, opts: FindOptions): FindMatch[] {
  const matcher = compileMatcher(opts);
  const range = opts.range ? normalizeRange(opts.range) : undefined;
  const matches: FindMatch[] = [];
  for (const [key, cell] of sheet.cells) {
    const row = Math.floor(key / 16384);
    const col = key % 16384;
    if (range && (row < range.start.row || row > range.end.row || col < range.start.col || col > range.end.col)) continue;
    const text = cellRawText(cell);
    if (!text) continue;
    const positions = matcher(text);
    for (const pos of positions) {
      matches.push({ address: { row, col }, text, start: pos, end: pos + (opts.regex ? 0 : opts.pattern.length) });
    }
  }
  return matches;
}

export interface ReplaceOptions extends FindOptions {
  replacement: string;
}

/**
 * Perform find/replace across `sheet`. Returns the number of cells changed.
 * Uses a setCells command so the whole operation is one undo step.
 */
export function replaceAll(workbook: Workbook, sheet: Sheet, opts: ReplaceOptions): number {
  const flags = (opts.caseSensitive ? '' : 'i') + 'g';
  const replacer = opts.regex ? new RegExp(opts.pattern, flags) : null;
  const range = opts.range ? normalizeRange(opts.range) : undefined;
  const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];
  for (const [key, cell] of sheet.cells) {
    const row = Math.floor(key / 16384);
    const col = key % 16384;
    if (range && (row < range.start.row || row > range.end.row || col < range.start.col || col > range.end.col)) continue;
    const text = cellRawText(cell);
    if (!text) continue;
    let replaced: string;
    if (opts.wholeCell) {
      const hit = opts.caseSensitive ? text === opts.pattern : text.toLowerCase() === opts.pattern.toLowerCase();
      if (!hit) continue;
      replaced = opts.replacement;
    } else if (replacer) {
      if (!replacer.test(text)) continue;
      replaced = text.replace(new RegExp(opts.pattern, flags), opts.replacement);
    } else {
      const needle = opts.caseSensitive ? opts.pattern : opts.pattern.toLowerCase();
      const hay = opts.caseSensitive ? text : text.toLowerCase();
      if (!hay.includes(needle)) continue;
      replaced = replaceAllPlain(text, opts.pattern, opts.replacement, opts.caseSensitive ?? false);
    }
    if (replaced === text) continue;
    const parsed = parseInput(replaced);
    changes.push({ address: { row, col }, next: parsed, prev: cell });
  }
  if (changes.length === 0) return 0;
  workbook.apply({ kind: 'setCells', sheetId: sheet.id, changes });
  return changes.length;
}

function replaceAllPlain(text: string, pattern: string, replacement: string, cs: boolean): string {
  if (cs) return text.split(pattern).join(replacement);
  // Case-insensitive plain replace: walk the string.
  const lowerHay = text.toLowerCase();
  const lowerNeedle = pattern.toLowerCase();
  let out = '';
  let i = 0;
  while (i < text.length) {
    const idx = lowerHay.indexOf(lowerNeedle, i);
    if (idx === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, idx) + replacement;
    i = idx + pattern.length;
  }
  return out;
}

export interface SortKey {
  col: number;
  ascending?: boolean;
}

/**
 * Sort `range` on `sheet` by the given keys (primary first). Produces a single
 * setCells command. `headerRow` = true skips the first row.
 */
export function sortRange(
  workbook: Workbook,
  sheet: Sheet,
  range: RangeAddress,
  keys: SortKey[],
  opts: { headerRow?: boolean } = {},
): number {
  const r = normalizeRange(range);
  const firstDataRow = opts.headerRow ? r.start.row + 1 : r.start.row;
  if (firstDataRow > r.end.row) return 0;
  const rows: Array<{ index: number; cells: Map<number, Cell> }> = [];
  for (let row = firstDataRow; row <= r.end.row; row++) {
    const m = new Map<number, Cell>();
    for (let col = r.start.col; col <= r.end.col; col++) {
      const cell = sheet.getCell({ row, col });
      if (cell) m.set(col, { ...cell });
    }
    rows.push({ index: row, cells: m });
  }
  rows.sort((a, b) => {
    for (const key of keys) {
      const av = valueForSort(a.cells.get(key.col));
      const bv = valueForSort(b.cells.get(key.col));
      const cmp = compareScalars(av, bv);
      if (cmp !== 0) return (key.ascending === false ? -1 : 1) * cmp;
    }
    return 0;
  });
  const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];
  for (let i = 0; i < rows.length; i++) {
    const newRow = firstDataRow + i;
    const sourceCells = rows[i]!.cells;
    for (let col = r.start.col; col <= r.end.col; col++) {
      const next = sourceCells.get(col);
      const prev = sheet.getCell({ row: newRow, col });
      changes.push({ address: { row: newRow, col }, next, prev });
    }
  }
  if (changes.length === 0) return 0;
  workbook.apply({ kind: 'setCells', sheetId: sheet.id, changes });
  return rows.length;
}

function valueForSort(cell: Cell | undefined): Scalar {
  if (!cell) return null;
  return cell.computed ?? cell.value ?? (typeof cell.raw === 'string' ? cell.raw : cell.raw);
}

function compareScalars(a: Scalar, b: Scalar): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // blanks sort last on ascending
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return toText(a).localeCompare(toText(b), undefined, { sensitivity: 'accent', numeric: true });
}

/**
 * Remove duplicate rows from `range` using the given columns as the identity.
 * If `cols` is empty, all columns are considered. Returns the number of rows removed.
 */
export function dedupeRange(
  workbook: Workbook,
  sheet: Sheet,
  range: RangeAddress,
  cols: number[] = [],
  opts: { headerRow?: boolean } = {},
): number {
  const r = normalizeRange(range);
  const firstDataRow = opts.headerRow ? r.start.row + 1 : r.start.row;
  const keyCols = cols.length > 0 ? cols : rangeCols(r);
  const seen = new Set<string>();
  const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];
  const keptRows: Array<Map<number, Cell>> = [];
  for (let row = firstDataRow; row <= r.end.row; row++) {
    const parts: string[] = [];
    for (const c of keyCols) parts.push(toText(valueForSort(sheet.getCell({ row, col: c }))));
    const key = parts.join('\u0001');
    if (seen.has(key)) continue;
    seen.add(key);
    const m = new Map<number, Cell>();
    for (let col = r.start.col; col <= r.end.col; col++) {
      const cell = sheet.getCell({ row, col });
      if (cell) m.set(col, { ...cell });
    }
    keptRows.push(m);
  }
  const removed = (r.end.row - firstDataRow + 1) - keptRows.length;
  for (let i = 0; i < keptRows.length; i++) {
    const destRow = firstDataRow + i;
    for (let col = r.start.col; col <= r.end.col; col++) {
      const next = keptRows[i]!.get(col);
      const prev = sheet.getCell({ row: destRow, col });
      changes.push({ address: { row: destRow, col }, next, prev });
    }
  }
  // Blank out the trailing rows previously occupied.
  for (let i = 0; i < removed; i++) {
    const destRow = firstDataRow + keptRows.length + i;
    for (let col = r.start.col; col <= r.end.col; col++) {
      const prev = sheet.getCell({ row: destRow, col });
      if (prev) changes.push({ address: { row: destRow, col }, next: undefined, prev });
    }
  }
  if (changes.length === 0) return 0;
  workbook.apply({ kind: 'setCells', sheetId: sheet.id, changes });
  return removed;
}

function rangeCols(r: RangeAddress): number[] {
  const out: number[] = [];
  for (let c = r.start.col; c <= r.end.col; c++) out.push(c);
  return out;
}

export interface TextToColumnsOptions {
  delimiter: string;
  maxSplits?: number;
  destCol?: number;
}

/**
 * Split the text in `range` (a single column is expected) by `delimiter` and
 * write the parts into neighbouring columns. Existing values are overwritten.
 */
export function textToColumns(
  workbook: Workbook,
  sheet: Sheet,
  range: RangeAddress,
  opts: TextToColumnsOptions,
): number {
  const r = normalizeRange(range);
  const destCol = opts.destCol ?? r.start.col;
  const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];
  let maxParts = 0;
  for (let row = r.start.row; row <= r.end.row; row++) {
    const cell = sheet.getCell({ row, col: r.start.col });
    const text = cellRawText(cell);
    const parts = text === '' ? [] : splitBy(text, opts.delimiter, opts.maxSplits);
    maxParts = Math.max(maxParts, parts.length);
    for (let i = 0; i < parts.length; i++) {
      const col = destCol + i;
      const next = parseInput(parts[i]!);
      const prev = sheet.getCell({ row, col });
      changes.push({ address: { row, col }, next, prev });
    }
  }
  if (changes.length === 0) return 0;
  workbook.apply({ kind: 'setCells', sheetId: sheet.id, changes });
  return maxParts;
}

function splitBy(s: string, delim: string, maxSplits?: number): string[] {
  if (delim === '') return [s];
  if (maxSplits === undefined) return s.split(delim);
  const out: string[] = [];
  let i = 0;
  while (out.length < maxSplits) {
    const idx = s.indexOf(delim, i);
    if (idx === -1) break;
    out.push(s.slice(i, idx));
    i = idx + delim.length;
  }
  out.push(s.slice(i));
  return out;
}

/** Helper the UI can use to map a packed cell key to an address. */
export function unpackKey(key: number): Address {
  return { row: Math.floor(key / 16384), col: key % 16384 };
}

/** Re-export for external use. */
export { cellKey };
