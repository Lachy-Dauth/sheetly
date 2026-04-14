/**
 * Context passed to function implementations and the evaluator: current cell
 * location, workbook, and a resolver for refs that respects the active sheet.
 */

import type { Workbook } from '../workbook';
import type { Address, RangeAddress } from '../address';
import type { ArrayValue, Scalar } from '../cell';

export interface EvalContext {
  workbook: Workbook;
  sheetId: string;
  cell: Address;
  /** Current recalc trail, to detect cycles. */
  trail: Set<string>;
}

export function trailKey(sheetId: string, a: Address): string {
  return `${sheetId}:${a.row},${a.col}`;
}

export function resolveCellValue(
  ctx: EvalContext,
  sheet: string | undefined,
  a: Address,
): Scalar {
  const sheetId = sheet ? ctx.workbook.sheetByName(sheet)?.id ?? ctx.sheetId : ctx.sheetId;
  const s = ctx.workbook.getSheet(sheetId);
  const cell = s.getCell(a);
  if (!cell) return null;
  if (typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
    return (cell.computed ?? null) as Scalar;
  }
  return (cell.value ?? (cell.raw as Scalar)) ?? null;
}

export function resolveRangeArray(
  ctx: EvalContext,
  sheet: string | undefined,
  range: RangeAddress,
): ArrayValue {
  const sheetId = sheet ? ctx.workbook.sheetByName(sheet)?.id ?? ctx.sheetId : ctx.sheetId;
  const s = ctx.workbook.getSheet(sheetId);
  const out: ArrayValue = [];
  for (let r = range.start.row; r <= range.end.row; r++) {
    const row: Scalar[] = [];
    for (let c = range.start.col; c <= range.end.col; c++) {
      const cell = s.getCell({ row: r, col: c });
      if (!cell) {
        row.push(null);
        continue;
      }
      if (typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
        row.push((cell.computed ?? null) as Scalar);
      } else {
        row.push((cell.value ?? (cell.raw as Scalar)) ?? null);
      }
    }
    out.push(row);
  }
  return out;
}
