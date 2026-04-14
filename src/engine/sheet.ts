/**
 * Sparse sheet model. Holds cells, column/row metadata, and merges.
 */

import type { Address, RangeAddress } from './address';
import { cellKey, fromCellKey, normalizeRange } from './address';
import type { Cell } from './cell';

export const DEFAULT_COL_WIDTH = 96;
export const DEFAULT_ROW_HEIGHT = 22;
export const DEFAULT_HEADER_HEIGHT = 22;
export const DEFAULT_HEADER_WIDTH = 48;

export interface ColMeta {
  width?: number;
  hidden?: boolean;
}
export interface RowMeta {
  height?: number;
  hidden?: boolean;
}

export interface SheetFreeze {
  rows: number;
  cols: number;
}

export interface MergedRange {
  id: number;
  range: RangeAddress;
}

let nextSheetId = 1;

export class Sheet {
  readonly id: string;
  name: string;
  color?: string;
  /** Sparse cell map, keyed by packed row*16384+col. */
  cells = new Map<number, Cell>();
  cols = new Map<number, ColMeta>();
  rows = new Map<number, RowMeta>();
  freeze: SheetFreeze = { rows: 0, cols: 0 };
  merges: MergedRange[] = [];
  /** Approx max used row/col, for navigation limits. */
  maxRow = 0;
  maxCol = 0;
  /** Default grid dimensions shown when sheet is fresh. */
  rowCount = 200;
  colCount = 26;

  constructor(name: string, id?: string) {
    this.id = id ?? `s${nextSheetId++}`;
    this.name = name;
  }

  getCell(a: Address): Cell | undefined {
    return this.cells.get(cellKey(a.row, a.col));
  }

  setCell(a: Address, cell: Cell | undefined): Cell | undefined {
    const key = cellKey(a.row, a.col);
    const prev = this.cells.get(key);
    const isEmpty =
      !cell ||
      ((cell.raw === null || cell.raw === '') &&
        cell.styleId === undefined &&
        cell.format === undefined &&
        cell.comment === undefined &&
        cell.validationId === undefined);
    if (isEmpty) {
      this.cells.delete(key);
    } else {
      this.cells.set(key, cell);
      if (a.row > this.maxRow) this.maxRow = a.row;
      if (a.col > this.maxCol) this.maxCol = a.col;
      if (a.row + 1 > this.rowCount) this.rowCount = a.row + 1;
      if (a.col + 1 > this.colCount) this.colCount = a.col + 1;
    }
    return prev;
  }

  patchCell(a: Address, patch: Partial<Cell>): Cell {
    const prev = this.getCell(a) ?? ({ raw: null } as Cell);
    const next: Cell = { ...prev, ...patch };
    this.setCell(a, next);
    return next;
  }

  colWidth(col: number): number {
    return this.cols.get(col)?.width ?? DEFAULT_COL_WIDTH;
  }

  rowHeight(row: number): number {
    return this.rows.get(row)?.height ?? DEFAULT_ROW_HEIGHT;
  }

  setColWidth(col: number, width: number): number | undefined {
    const prev = this.cols.get(col)?.width;
    const meta = this.cols.get(col) ?? {};
    meta.width = width;
    this.cols.set(col, meta);
    return prev;
  }

  setRowHeight(row: number, height: number): number | undefined {
    const prev = this.rows.get(row)?.height;
    const meta = this.rows.get(row) ?? {};
    meta.height = height;
    this.rows.set(row, meta);
    return prev;
  }

  /** Iterate non-blank cells in row order, optionally within a range. */
  *iterateCells(range?: RangeAddress): Generator<{ address: Address; cell: Cell }> {
    if (!range) {
      for (const [key, cell] of this.cells) {
        yield { address: fromCellKey(key), cell };
      }
      return;
    }
    const r = normalizeRange(range);
    for (let row = r.start.row; row <= r.end.row; row++) {
      for (let col = r.start.col; col <= r.end.col; col++) {
        const cell = this.cells.get(cellKey(row, col));
        if (cell) yield { address: { row, col }, cell };
      }
    }
  }

  addMerge(range: RangeAddress): MergedRange {
    const id = (this.merges[this.merges.length - 1]?.id ?? 0) + 1;
    const merge: MergedRange = { id, range: normalizeRange(range) };
    this.merges.push(merge);
    return merge;
  }

  removeMerge(id: number): void {
    this.merges = this.merges.filter((m) => m.id !== id);
  }

  findMergeAt(a: Address): MergedRange | undefined {
    for (const m of this.merges) {
      const { start, end } = m.range;
      if (a.row >= start.row && a.row <= end.row && a.col >= start.col && a.col <= end.col) {
        return m;
      }
    }
    return undefined;
  }
}
