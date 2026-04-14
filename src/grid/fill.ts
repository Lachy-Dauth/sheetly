/**
 * Fill-handle logic. Extends a source range across a destination range using
 * Excel-style series detection:
 *   - Pure numbers form an arithmetic progression (1,2,3 → 4,5,6; 5,10 → 15,20).
 *   - A single number repeats (Excel's behaviour without holding Ctrl).
 *   - Date serials extend by the average step too.
 *   - Text repeats verbatim.
 *   - Formulas have their relative refs shifted by the row/col delta; refs
 *     guarded by `$` (absolute) stay pinned.
 *
 * The whole operation goes through a single setCells command so the user can
 * undo it with one ⌘Z.
 */

import type { Address, RangeAddress } from '../engine/address';
import { normalizeRange, lettersToCol, colToLetters } from '../engine/address';
import type { Cell } from '../engine/cell';
import type { Sheet } from '../engine/sheet';
import type { Workbook } from '../engine/workbook';
import { parseInput } from '../engine/parse-input';
import { tokenize } from '../engine/formula/tokens';

export type FillDirection = 'down' | 'up' | 'right' | 'left';

/**
 * Compute the destination range and direction implied by extending `source`
 * to include `target`. Returns null when the target sits inside the source.
 */
export function fillExtent(
  source: RangeAddress,
  target: Address,
): { dest: RangeAddress; direction: FillDirection } | null {
  const s = normalizeRange(source);
  const inside =
    target.row >= s.start.row && target.row <= s.end.row &&
    target.col >= s.start.col && target.col <= s.end.col;
  if (inside) return null;
  const overBelow = target.row - s.end.row;
  const overAbove = s.start.row - target.row;
  const overRight = target.col - s.end.col;
  const overLeft = s.start.col - target.col;
  const verticalOver = Math.max(overBelow, overAbove);
  const horizontalOver = Math.max(overRight, overLeft);
  if (verticalOver >= horizontalOver && verticalOver > 0) {
    if (overBelow >= overAbove) {
      return {
        dest: { start: { row: s.end.row + 1, col: s.start.col }, end: { row: target.row, col: s.end.col } },
        direction: 'down',
      };
    }
    return {
      dest: { start: { row: target.row, col: s.start.col }, end: { row: s.start.row - 1, col: s.end.col } },
      direction: 'up',
    };
  }
  if (horizontalOver > 0) {
    if (overRight >= overLeft) {
      return {
        dest: { start: { row: s.start.row, col: s.end.col + 1 }, end: { row: s.end.row, col: target.col } },
        direction: 'right',
      };
    }
    return {
      dest: { start: { row: s.start.row, col: target.col }, end: { row: s.end.row, col: s.start.col - 1 } },
      direction: 'left',
    };
  }
  return null;
}

interface SeriesPlan {
  /**
   * Compute the cell to write at `step` (0-based, counting from where the
   * destination begins, in the user's drag direction). `cycleSource` is the
   * source cell at the same position within the repeating cycle.
   * `dRow` / `dCol` are the row/col deltas vs the cycleSource address.
   */
  valueAt(args: {
    step: number;
    cycleSource: Cell | undefined;
    dRow: number;
    dCol: number;
  }): Cell | undefined;
}

/**
 * Apply the fill across `dest` using the pattern in `source`. `direction`
 * tells us which axis the user dragged; the orthogonal axis is just copied.
 */
export function fillRange(
  workbook: Workbook,
  sheet: Sheet,
  source: RangeAddress,
  dest: RangeAddress,
  direction: FillDirection,
): number {
  const s = normalizeRange(source);
  const d = normalizeRange(dest);
  const axis: 'row' | 'col' = direction === 'down' || direction === 'up' ? 'row' : 'col';
  const reverse = direction === 'up' || direction === 'left';
  const sourceLen = axis === 'row' ? s.end.row - s.start.row + 1 : s.end.col - s.start.col + 1;
  const orthoLen = axis === 'row' ? s.end.col - s.start.col + 1 : s.end.row - s.start.row + 1;
  const destLen = axis === 'row' ? d.end.row - d.start.row + 1 : d.end.col - d.start.col + 1;

  const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];

  for (let oi = 0; oi < orthoLen; oi++) {
    // Pull out the source line along the fill axis (in source-storage order,
    // i.e. always low-index → high-index regardless of drag direction).
    const sourceCells: Array<Cell | undefined> = [];
    for (let i = 0; i < sourceLen; i++) {
      const addr =
        axis === 'row'
          ? { row: s.start.row + i, col: s.start.col + oi }
          : { row: s.start.row + oi, col: s.start.col + i };
      sourceCells.push(sheet.getCell(addr));
    }
    const plan = makePlan(sourceCells, reverse);

    for (let i = 0; i < destLen; i++) {
      // Step counts how far past the source we are in the drag direction.
      // Mapping back to the source cycle:
      //   forward fill: cycleIdx = (sourceLen + i) % sourceLen → walk 0,1,2…
      //   reverse fill: cycleIdx = (sourceLen − 1 − i) mod sourceLen
      const cycleIdx =
        reverse
          ? ((sourceLen - 1 - (i % sourceLen)) % sourceLen + sourceLen) % sourceLen
          : i % sourceLen;
      const cycleSource = sourceCells[cycleIdx];
      const destAddr = computeDestAddr(d, axis, reverse, i, oi);
      // Distance (in row/col cells) between cycleSource and destAddr.
      const sourceAddr =
        axis === 'row'
          ? { row: s.start.row + cycleIdx, col: s.start.col + oi }
          : { row: s.start.row + oi, col: s.start.col + cycleIdx };
      const dRow = destAddr.row - sourceAddr.row;
      const dCol = destAddr.col - sourceAddr.col;
      const next = plan.valueAt({ step: i, cycleSource, dRow, dCol });
      const prev = sheet.getCell(destAddr);
      changes.push({ address: destAddr, next, prev });
    }
  }

  if (changes.length === 0) return 0;
  workbook.apply({ kind: 'setCells', sheetId: sheet.id, changes });
  return changes.length;
}

function computeDestAddr(
  d: RangeAddress,
  axis: 'row' | 'col',
  reverse: boolean,
  step: number,
  ortho: number,
): Address {
  if (axis === 'row') {
    const row = reverse ? d.end.row - step : d.start.row + step;
    return { row, col: d.start.col + ortho };
  }
  const col = reverse ? d.end.col - step : d.start.col + step;
  return { row: d.start.row + ortho, col };
}

/** Pick the right SeriesPlan based on what's in the source line. */
function makePlan(source: Array<Cell | undefined>, reverse: boolean): SeriesPlan {
  // Empty source line → blank fill.
  if (source.every((c) => !c || c.raw === null || c.raw === '')) {
    return { valueAt: () => undefined };
  }

  // All formulas → shift relative refs each step.
  const allFormula = source.every((c) => typeof c?.raw === 'string' && c.raw.startsWith('='));
  if (allFormula) {
    return {
      valueAt: ({ cycleSource, dRow, dCol }) => {
        if (!cycleSource || typeof cycleSource.raw !== 'string') return undefined;
        const shifted = shiftFormula(cycleSource.raw, dRow, dCol);
        const next: Cell = { raw: shifted };
        if (cycleSource.styleId !== undefined) next.styleId = cycleSource.styleId;
        if (cycleSource.format) next.format = cycleSource.format;
        return next;
      },
    };
  }

  // Numeric series — works for plain numbers and date serials with a uniform step.
  const nums = source.map((c) => numericValue(c));
  const allNumeric = nums.every((n) => typeof n === 'number');
  if (allNumeric) {
    const numbers = nums as number[];
    const step =
      numbers.length >= 2
        ? (numbers[numbers.length - 1]! - numbers[0]!) / (numbers.length - 1)
        : 0;
    // If the source isn't actually evenly spaced, fall back to repeat.
    const linear =
      numbers.length < 2 ||
      numbers.every((n, idx) => Math.abs(n - (numbers[0]! + step * idx)) < 1e-9);
    if (linear) {
      // Excel quirk: a single number repeats rather than extrapolating.
      const effectiveStep = numbers.length >= 2 ? step : 0;
      const lastIdx = numbers.length - 1;
      return {
        valueAt: ({ step: i, cycleSource }) => {
          // Whole-cycle distance from the source block to the destination cell.
          const cycles = Math.floor(i / numbers.length) + 1;
          const baseValue = reverse ? numbers[0]! : numbers[lastIdx]!;
          // For reverse fills we step downward; for forward fills, upward.
          const stepsFromBase = reverse
            ? -((i % numbers.length) + (cycles - 1) * numbers.length + 1)
            : (i % numbers.length) + (cycles - 1) * numbers.length + 1;
          const value = baseValue + effectiveStep * stepsFromBase;
          return numericCell(value, cycleSource, source);
        },
      };
    }
  }

  // Default: repeat the source verbatim.
  return {
    valueAt: ({ cycleSource }) => (cycleSource ? { ...cycleSource } : undefined),
  };
}

function numericValue(cell: Cell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.value === 'number') return cell.value;
  if (typeof cell.raw === 'number') return cell.raw;
  return null;
}

function numericCell(
  value: number,
  template: Cell | undefined,
  sourceLine: Array<Cell | undefined>,
): Cell {
  const fmt = template?.format ?? sourceLine.find((c) => c?.format)?.format;
  const styleId = template?.styleId ?? sourceLine.find((c) => c?.styleId !== undefined)?.styleId;
  // Date-formatted serials need to round-trip through parseInput so the
  // resulting cell still renders as a date.
  if (fmt && /[ymd]/i.test(fmt)) {
    const iso = serialToIso(value);
    const parsed = parseInput(iso) ?? { raw: iso, value };
    const out: Cell = { ...parsed, value, format: parsed.format ?? fmt };
    if (styleId !== undefined) out.styleId = styleId;
    return out;
  }
  // Plain number.
  const out: Cell = { raw: value, value };
  if (fmt) out.format = fmt;
  if (styleId !== undefined) out.styleId = styleId;
  return out;
}

function serialToIso(serial: number): string {
  // 1899-12-30 base (matches parseInput.dateToSerial).
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  const date = new Date(ms);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Shift A1-style references in a formula by (dRow, dCol). Absolute parts
 * (those guarded by `$`) are left untouched. Out-of-range refs become `#REF!`.
 */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!formula.startsWith('=')) return formula;
  const body = formula.slice(1);
  const tokens = tokenize(body);
  let out = '=';
  let cursor = 0;
  for (const tok of tokens) {
    if (tok.kind === 'eof') break;
    if (tok.start > cursor) out += body.slice(cursor, tok.start);
    if (tok.kind === 'ref' || tok.kind === 'range-ref') {
      out += shiftRefText(tok.text, dRow, dCol);
    } else {
      out += body.slice(tok.start, tok.end);
    }
    cursor = tok.end;
  }
  if (cursor < body.length) out += body.slice(cursor);
  return out;
}

const REF_PART = /^(?:((?:'[^']*'|[A-Za-z_][\w. ]*))!)?(\$?)([A-Za-z]+)(\$?)(\d+)$/;

function shiftRefText(text: string, dRow: number, dCol: number): string {
  if (text.includes(':')) {
    const colonIdx = text.indexOf(':');
    return shiftRefText(text.slice(0, colonIdx), dRow, dCol) + ':' + shiftRefText(text.slice(colonIdx + 1), dRow, dCol);
  }
  const m = text.match(REF_PART);
  if (!m) return text;
  const sheet = m[1];
  const absCol = m[2] === '$';
  const colLetters = m[3]!;
  const absRow = m[4] === '$';
  const rowNum = parseInt(m[5]!, 10);
  const newColIdx = absCol ? lettersToCol(colLetters) : lettersToCol(colLetters) + dCol;
  const newRowIdx = absRow ? rowNum - 1 : rowNum - 1 + dRow;
  if (newColIdx < 0 || newRowIdx < 0) return '#REF!';
  const newCol = colToLetters(newColIdx);
  const sheetPrefix = sheet ? sheet + '!' : '';
  return `${sheetPrefix}${absCol ? '$' : ''}${newCol}${absRow ? '$' : ''}${newRowIdx + 1}`;
}
