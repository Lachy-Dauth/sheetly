/**
 * Tables: a named structured range with headers, optional totals row, banded-row
 * styling and per-column filters. Stored on the sheet (not as cells).
 */

import type { Address, RangeAddress } from './address';
import { normalizeRange } from './address';

export type AggregateFn =
  | 'sum'
  | 'average'
  | 'count'
  | 'min'
  | 'max'
  | 'stdev'
  | 'var'
  | 'none';

export interface ColumnFilter {
  /** Exact-match whitelist (null = not set). */
  values?: Set<string>;
  /** Substring search (case-insensitive). */
  search?: string;
  /** Numeric condition: e.g. { op: '>', value: 10 }. */
  condition?: { op: '>' | '>=' | '<' | '<=' | '=' | '<>'; value: number | string };
}

export interface TableColumn {
  name: string;
  filter?: ColumnFilter;
  totalFn?: AggregateFn;
}

export interface TableStyle {
  bandedRows?: boolean;
  headerFill?: string;
  headerColor?: string;
  bandFill?: string;
}

export interface Table {
  id: string;
  name: string;
  sheetId: string;
  range: RangeAddress;
  headerRow: boolean;
  totalsRow: boolean;
  columns: TableColumn[];
  style: TableStyle;
}

let nextId = 1;

export const DEFAULT_TABLE_STYLE: TableStyle = {
  bandedRows: true,
  headerFill: '#1f6feb',
  headerColor: '#ffffff',
  bandFill: '#f6f8fa',
};

export function makeTable(args: {
  name: string;
  sheetId: string;
  range: RangeAddress;
  headerNames: string[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: Partial<TableStyle>;
}): Table {
  return {
    id: `t${nextId++}`,
    name: args.name,
    sheetId: args.sheetId,
    range: normalizeRange(args.range),
    headerRow: args.headerRow ?? true,
    totalsRow: args.totalsRow ?? false,
    columns: args.headerNames.map((name) => ({ name })),
    style: { ...DEFAULT_TABLE_STYLE, ...args.style },
  };
}

/** Inclusive row range where data lives (excludes header and totals). */
export function dataRange(t: Table): { startRow: number; endRow: number } {
  const { start, end } = t.range;
  return {
    startRow: t.headerRow ? start.row + 1 : start.row,
    endRow: t.totalsRow ? end.row - 1 : end.row,
  };
}

export function tableContainsAddress(t: Table, a: Address): boolean {
  const { start, end } = t.range;
  return (
    a.row >= start.row && a.row <= end.row && a.col >= start.col && a.col <= end.col
  );
}

export function columnIndexByName(t: Table, name: string): number {
  const lower = name.toLowerCase();
  return t.columns.findIndex((c) => c.name.toLowerCase() === lower);
}

/** Column absolute sheet column index. */
export function columnAbsoluteIndex(t: Table, columnIdx: number): number {
  return t.range.start.col + columnIdx;
}

/** Returns the RangeAddress for a structured reference like Table[Col] or Table[#Headers]. */
export function resolveStructuredRange(
  t: Table,
  specifier: string,
  rowContext?: Address,
): RangeAddress | null {
  const data = dataRange(t);
  const lower = specifier.trim().toLowerCase();

  if (lower === '#all') return t.range;
  if (lower === '#headers') {
    if (!t.headerRow) return null;
    return {
      start: { row: t.range.start.row, col: t.range.start.col },
      end: { row: t.range.start.row, col: t.range.end.col },
    };
  }
  if (lower === '#totals') {
    if (!t.totalsRow) return null;
    return {
      start: { row: t.range.end.row, col: t.range.start.col },
      end: { row: t.range.end.row, col: t.range.end.col },
    };
  }
  if (lower === '#data' || lower === '') {
    return {
      start: { row: data.startRow, col: t.range.start.col },
      end: { row: data.endRow, col: t.range.end.col },
    };
  }
  if (lower.startsWith('@')) {
    // Current row reference: [@ColName]
    const colName = specifier.slice(1);
    const idx = columnIndexByName(t, colName);
    if (idx < 0) return null;
    const row = rowContext?.row ?? data.startRow;
    const col = columnAbsoluteIndex(t, idx);
    return { start: { row, col }, end: { row, col } };
  }
  // Plain column name → entire data column
  const idx = columnIndexByName(t, specifier);
  if (idx < 0) return null;
  const col = columnAbsoluteIndex(t, idx);
  return {
    start: { row: data.startRow, col },
    end: { row: data.endRow, col },
  };
}

export class TableRegistry {
  private byId = new Map<string, Table>();
  private byName = new Map<string, Table>();

  add(t: Table): void {
    this.byId.set(t.id, t);
    this.byName.set(t.name.toLowerCase(), t);
  }

  remove(id: string): Table | undefined {
    const t = this.byId.get(id);
    if (!t) return undefined;
    this.byId.delete(id);
    this.byName.delete(t.name.toLowerCase());
    return t;
  }

  get(id: string): Table | undefined {
    return this.byId.get(id);
  }

  byNameCI(name: string): Table | undefined {
    return this.byName.get(name.toLowerCase());
  }

  listForSheet(sheetId: string): Table[] {
    return [...this.byId.values()].filter((t) => t.sheetId === sheetId);
  }

  findAt(sheetId: string, a: Address): Table | undefined {
    for (const t of this.byId.values()) {
      if (t.sheetId === sheetId && tableContainsAddress(t, a)) return t;
    }
    return undefined;
  }

  all(): Table[] {
    return [...this.byId.values()];
  }

  /** Grow a table's range by n rows when a cell is edited just below it. */
  expandIfAdjacent(sheetId: string, a: Address): Table | undefined {
    for (const t of this.byId.values()) {
      if (t.sheetId !== sheetId) continue;
      const { start, end } = t.range;
      if (a.row === end.row + 1 && a.col >= start.col && a.col <= end.col) {
        t.range = { start, end: { row: a.row, col: end.col } };
        return t;
      }
      if (a.col === end.col + 1 && a.row >= start.row && a.row <= end.row) {
        // Expand columns — also append a column name.
        t.range = { start, end: { row: end.row, col: a.col } };
        t.columns.push({ name: `Column${t.columns.length + 1}` });
        return t;
      }
    }
    return undefined;
  }

  /** Unique next name like "Table1", "Table2". */
  uniqueName(base = 'Table'): string {
    let i = 1;
    while (this.byName.has(`${base}${i}`.toLowerCase())) i++;
    return `${base}${i}`;
  }
}
