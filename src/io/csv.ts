/**
 * Placeholder M4 surface. Full CSV parser lands with that milestone; for now
 * a conservative default implementation lets the UI compile and the smoke tests
 * round-trip simple files.
 */

import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import { parseInput } from '../engine/parse-input';
import type { Cell } from '../engine/cell';
import { toText } from '../engine/cell';

export function importCsv(workbook: Workbook, sheetId: string, text: string): void {
  const rows = naiveParse(text);
  const sheet = workbook.getSheet(sheetId);
  workbook.batch(() => {
    rows.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val === '') return;
        const cell = parseInput(val) ?? ({ raw: val, value: val } as Cell);
        sheet.setCell({ row: r, col: c }, cell);
      });
    });
  });
}

export function exportCsv(sheet: Sheet): string {
  let maxRow = 0;
  let maxCol = 0;
  for (const [key] of sheet.cells) {
    const row = Math.floor(key / 16384);
    const col = key % 16384;
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
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
      const v = cell.computed ?? cell.value ?? (typeof cell.raw === 'string' ? cell.raw : cell.raw);
      row.push(escape(toText(v ?? null)));
    }
    lines.push(row.join(','));
  }
  const out = lines.join('\n');
  if (typeof document !== 'undefined') {
    const blob = new Blob([out], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return out;
}

function escape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function naiveParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // swallow
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
