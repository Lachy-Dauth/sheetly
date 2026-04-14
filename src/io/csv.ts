/**
 * CSV / JSON import and export for a Sheet / Workbook.
 * Delegates parsing to ./csv-parse. Type-inference on import is opt-out.
 */

import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Cell } from '../engine/cell';
import { toText } from '../engine/cell';
import { parseInput } from '../engine/parse-input';
import {
  DEFAULT_OPTIONS,
  decodeText,
  detectDelimiter,
  escapeField,
  parseCsv,
} from './csv-parse';
import type { CsvOptions } from './csv-parse';

export interface ImportOptions extends CsvOptions {
  /** If true, try to auto-detect delimiter when not explicitly given. */
  detect?: boolean;
  /** When false, every value is stored as a raw string; no parseInput. */
  inferTypes?: boolean;
  /** Column offset for the first column. */
  startCol?: number;
  /** Row offset for the first row. */
  startRow?: number;
}

export function importCsv(
  workbook: Workbook,
  sheetId: string,
  text: string,
  options: ImportOptions = {},
): void {
  const delim = options.delimiter ?? (options.detect !== false ? detectDelimiter(text) : DEFAULT_OPTIONS.delimiter);
  const rows = parseCsv(text, { ...options, delimiter: delim });
  const sheet = workbook.getSheet(sheetId);
  const startCol = options.startCol ?? 0;
  const startRow = options.startRow ?? 0;
  workbook.batch(() => {
    rows.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val === '') return;
        const cell: Cell | undefined =
          options.inferTypes === false
            ? { raw: val, value: val }
            : parseInput(val) ?? { raw: val, value: val };
        sheet.setCell({ row: startRow + r, col: startCol + c }, cell);
      });
    });
  });
}

export async function importCsvFile(
  workbook: Workbook,
  sheetId: string,
  file: File,
  options: ImportOptions = {},
): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const text = decodeText(buf);
  importCsv(workbook, sheetId, text, options);
}

export interface ExportOptions {
  delimiter?: string;
  /** Quote every field, not just ones that need it. */
  quoteAll?: boolean;
  /** Use computed value if present; otherwise the raw/user value. */
  computed?: boolean;
  /** Stop at last populated row/col (default) vs. use sheet.rowCount/colCount. */
  trimEmpty?: boolean;
}

export function serializeSheetCsv(sheet: Sheet, options: ExportOptions = {}): string {
  const delim = options.delimiter ?? ',';
  let maxRow = 0;
  let maxCol = 0;
  for (const [key] of sheet.cells) {
    const row = Math.floor(key / 16384);
    const col = key % 16384;
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  }
  if (!options.trimEmpty) {
    maxRow = Math.max(maxRow, sheet.rowCount - 1, 0);
    maxCol = Math.max(maxCol, sheet.colCount - 1, 0);
  }
  const lines: string[] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = sheet.getCell({ row: r, col: c });
      if (!cell) {
        row.push('');
        continue;
      }
      const v = options.computed === false
        ? (typeof cell.raw === 'string' ? cell.raw : cell.raw)
        : cell.computed ?? cell.value ?? (typeof cell.raw === 'string' ? cell.raw : cell.raw);
      const text = toText(v ?? null);
      row.push(options.quoteAll ? `"${text.replace(/"/g, '""')}"` : escapeField(text, delim));
    }
    lines.push(row.join(delim));
  }
  return lines.join('\r\n');
}

export function exportCsv(sheet: Sheet, options: ExportOptions = {}): string {
  const out = serializeSheetCsv(sheet, options);
  triggerDownload(out, `${sheet.name}.csv`, 'text/csv');
  return out;
}

export function exportWorkbookJson(workbook: Workbook): string {
  const dump = {
    version: 1,
    namedRanges: Array.from(workbook.namedRanges.values()),
    styles: (workbook.styles as any).list ?? [],
    sheets: workbook.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      freeze: s.freeze,
      cols: Array.from(s.cols.entries()),
      rows: Array.from(s.rows.entries()),
      merges: s.merges,
      cells: Array.from(s.cells.entries()).map(([key, cell]) => ({
        key,
        ...cell,
      })),
    })),
  };
  const text = JSON.stringify(dump, null, 2);
  triggerDownload(text, 'workbook.json', 'application/json');
  return text;
}

function triggerDownload(content: string, filename: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
