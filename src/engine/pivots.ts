/**
 * Pivot model: a declarative summary of a source range, with row/column/value
 * fields + optional filters. The actual aggregation/layout lives next door in
 * pivot-aggregate.ts and pivot-layout.ts.
 */

import type { Address, RangeAddress } from './address';

export type PivotAggregate =
  | 'sum'
  | 'count'
  | 'avg'
  | 'min'
  | 'max'
  | 'stdev'
  | 'var'
  | 'distinctCount';

export type PivotGrouping =
  | { kind: 'none' }
  | { kind: 'date'; unit: 'year' | 'quarter' | 'month' | 'day' }
  | { kind: 'numberRange'; step: number; start?: number };

export interface PivotField {
  /** 0-based column in the source range. */
  sourceColumn: number;
  /** Display label (defaults to the source header). */
  label?: string;
  grouping?: PivotGrouping;
  /** Ascending (default) or descending sort of the resulting keys. */
  descending?: boolean;
}

export interface PivotValueField extends PivotField {
  agg: PivotAggregate;
}

export interface PivotFilter extends PivotField {
  /** If set, only rows whose grouped key appears in `accept` are retained. */
  accept?: string[];
}

export interface PivotSource {
  sheetId: string;
  range: RangeAddress;
  hasHeader: boolean;
}

export interface Pivot {
  id: string;
  name: string;
  /** The sheet whose cells the pivot writes into. */
  sheetId: string;
  /** Top-left output anchor. */
  output: Address;
  source: PivotSource;
  rows: PivotField[];
  cols: PivotField[];
  values: PivotValueField[];
  filters: PivotFilter[];
  grandTotals: { rows: boolean; cols: boolean };
}

let nextId = 1;

export function makePivot(args: {
  name?: string;
  sheetId: string;
  output: Address;
  source: PivotSource;
  rows?: PivotField[];
  cols?: PivotField[];
  values?: PivotValueField[];
  filters?: PivotFilter[];
  grandTotals?: { rows: boolean; cols: boolean };
}): Pivot {
  const idNum = nextId++;
  return {
    id: `p${idNum}`,
    name: args.name ?? `Pivot${idNum}`,
    sheetId: args.sheetId,
    output: args.output,
    source: args.source,
    rows: args.rows ?? [],
    cols: args.cols ?? [],
    values: args.values ?? [],
    filters: args.filters ?? [],
    grandTotals: args.grandTotals ?? { rows: true, cols: true },
  };
}

export class PivotRegistry {
  private byId = new Map<string, Pivot>();

  add(p: Pivot): void {
    this.byId.set(p.id, p);
  }
  remove(id: string): Pivot | undefined {
    const p = this.byId.get(id);
    if (p) this.byId.delete(id);
    return p;
  }
  get(id: string): Pivot | undefined {
    return this.byId.get(id);
  }
  all(): Pivot[] {
    return [...this.byId.values()];
  }
  listForSheet(sheetId: string): Pivot[] {
    return this.all().filter((p) => p.sheetId === sheetId);
  }
}
