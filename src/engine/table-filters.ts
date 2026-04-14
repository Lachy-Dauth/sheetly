/**
 * Evaluate table column filters against a sheet, returning the set of data row
 * indices that should be hidden. Filters combine with AND semantics across columns.
 */

import type { Sheet } from './sheet';
import type { Table } from './tables';
import { dataRange } from './tables';
import { toText } from './cell';

export function computeHiddenRows(table: Table, sheet: Sheet): Set<number> {
  const hidden = new Set<number>();
  const range = dataRange(table);
  const hasAnyFilter = table.columns.some((c) => c.filter);
  if (!hasAnyFilter) return hidden;
  for (let row = range.startRow; row <= range.endRow; row++) {
    let keep = true;
    for (let ci = 0; ci < table.columns.length; ci++) {
      const col = table.columns[ci]!;
      if (!col.filter) continue;
      const cell = sheet.getCell({ row, col: table.range.start.col + ci });
      const raw = cell?.computed ?? cell?.value ?? (cell ? cell.raw : null);
      if (!passesFilter(raw ?? null, col.filter)) {
        keep = false;
        break;
      }
    }
    if (!keep) hidden.add(row);
  }
  return hidden;
}

function passesFilter(value: unknown, filter: NonNullable<Table['columns'][number]['filter']>): boolean {
  const text = value == null ? '' : toText(value as never);
  if (filter.values && filter.values.size > 0 && !filter.values.has(text)) {
    return false;
  }
  if (filter.search && !text.toLowerCase().includes(filter.search.toLowerCase())) {
    return false;
  }
  if (filter.condition) {
    const { op, value: cmp } = filter.condition;
    const n = typeof value === 'number' ? value : Number(text);
    const isNumeric = Number.isFinite(n) && typeof cmp === 'number';
    if (isNumeric) {
      const cn = cmp as number;
      if (op === '>' && !(n > cn)) return false;
      if (op === '>=' && !(n >= cn)) return false;
      if (op === '<' && !(n < cn)) return false;
      if (op === '<=' && !(n <= cn)) return false;
      if (op === '=' && !(n === cn)) return false;
      if (op === '<>' && !(n !== cn)) return false;
    } else {
      const s = String(cmp);
      if (op === '=' && text !== s) return false;
      if (op === '<>' && text === s) return false;
    }
  }
  return true;
}

/** Apply filter results to sheet row meta (side effect — toggles `hidden`). */
export function applyFilterToSheet(table: Table, sheet: Sheet): void {
  const hidden = computeHiddenRows(table, sheet);
  const range = dataRange(table);
  for (let r = range.startRow; r <= range.endRow; r++) {
    const meta = sheet.rows.get(r) ?? {};
    const wasHidden = meta.hidden ?? false;
    const shouldHide = hidden.has(r);
    if (wasHidden !== shouldHide) {
      meta.hidden = shouldHide;
      sheet.rows.set(r, meta);
    }
  }
}
