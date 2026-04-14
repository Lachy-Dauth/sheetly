/**
 * Copy / cut / paste support for the grid.
 *
 * - "Plain" clipboard (text/plain) uses TSV so the selection can also be
 *   pasted into other spreadsheet applications.
 * - An additional rich payload (application/x-sheetly+json) is set when
 *   copying inside the app so we can preserve raw values, formulas and
 *   style ids across cells on paste.
 */

import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Cell } from '../engine/cell';
import { toText } from '../engine/cell';
import type { Address, RangeAddress } from '../engine/address';
import { normalizeRange } from '../engine/address';
import { escapeField, parseCsv } from '../io/csv-parse';

export const SHEETLY_CLIPBOARD_MIME = 'application/x-sheetly+json';

export interface ClipCell {
  /** Raw user value (string/number/boolean/null). */
  raw: Cell['raw'];
  /** Cached parsed value (for non-formula cells). */
  value?: Cell['value'];
  /** Display format override. */
  format?: string;
  /** Opaque style id from the source workbook. */
  styleId?: number;
}

export interface ClipPayload {
  version: 1;
  rows: number;
  cols: number;
  /** Row-major: cells[r][c] — undefined for blank cells. */
  cells: Array<Array<ClipCell | null>>;
}

export function buildTsv(sheet: Sheet, range: RangeAddress): string {
  const r = normalizeRange(range);
  const lines: string[] = [];
  for (let row = r.start.row; row <= r.end.row; row++) {
    const out: string[] = [];
    for (let col = r.start.col; col <= r.end.col; col++) {
      const cell = sheet.getCell({ row, col });
      let text = '';
      if (cell) {
        // Prefer the computed/cached value so consumers see the final string.
        const v =
          typeof cell.raw === 'string' && cell.raw.startsWith('=')
            ? cell.computed ?? null
            : cell.value ?? cell.raw;
        text = toText(v ?? null);
      }
      out.push(escapeField(text, '\t'));
    }
    lines.push(out.join('\t'));
  }
  return lines.join('\r\n');
}

export function buildRichPayload(sheet: Sheet, range: RangeAddress): ClipPayload {
  const r = normalizeRange(range);
  const rows = r.end.row - r.start.row + 1;
  const cols = r.end.col - r.start.col + 1;
  const cells: Array<Array<ClipCell | null>> = [];
  for (let row = r.start.row; row <= r.end.row; row++) {
    const line: Array<ClipCell | null> = [];
    for (let col = r.start.col; col <= r.end.col; col++) {
      const cell = sheet.getCell({ row, col });
      if (!cell) {
        line.push(null);
      } else {
        line.push({
          raw: cell.raw,
          value: cell.value,
          format: cell.format,
          styleId: cell.styleId,
        });
      }
    }
    cells.push(line);
  }
  return { version: 1, rows, cols, cells };
}

/** Attach TSV + rich payload to the clipboard event. */
export function writeClipboard(
  event: { clipboardData: DataTransfer | null; preventDefault: () => void },
  sheet: Sheet,
  range: RangeAddress,
): void {
  const dt = event.clipboardData;
  if (!dt) return;
  const tsv = buildTsv(sheet, range);
  const rich = buildRichPayload(sheet, range);
  dt.setData('text/plain', tsv);
  try {
    dt.setData(SHEETLY_CLIPBOARD_MIME, JSON.stringify(rich));
  } catch {
    // Some browsers restrict custom mime types; fallback to plain only.
  }
  event.preventDefault();
}

/** Paste clipboard contents into the sheet starting at the active cell. */
export function pasteFromClipboard(
  event: { clipboardData: DataTransfer | null; preventDefault: () => void },
  workbook: Workbook,
  sheet: Sheet,
  target: Address,
): boolean {
  const dt = event.clipboardData;
  if (!dt) return false;
  event.preventDefault();

  const rich = dt.getData(SHEETLY_CLIPBOARD_MIME);
  if (rich) {
    try {
      const payload = JSON.parse(rich) as ClipPayload;
      if (payload && Array.isArray(payload.cells)) {
        pasteRich(workbook, sheet, target, payload);
        return true;
      }
    } catch {
      // fall through to plain-text paste
    }
  }

  const text = dt.getData('text/plain');
  if (!text) return false;
  pastePlain(workbook, sheet, target, text);
  return true;
}

export function pasteRich(
  workbook: Workbook,
  sheet: Sheet,
  target: Address,
  payload: ClipPayload,
): void {
  workbook.batch(() => {
    for (let r = 0; r < payload.cells.length; r++) {
      const row = payload.cells[r]!;
      for (let c = 0; c < row.length; c++) {
        const clip = row[c];
        const addr = { row: target.row + r, col: target.col + c };
        if (!clip) {
          // Blank source cell: clear the destination but keep existing metadata.
          const existing = sheet.getCell(addr);
          const next: Cell | undefined =
            existing &&
            (existing.styleId !== undefined ||
              existing.comment !== undefined ||
              existing.validationId !== undefined)
              ? {
                  raw: null,
                  styleId: existing.styleId,
                  comment: existing.comment,
                  validationId: existing.validationId,
                }
              : undefined;
          workbook.apply({
            kind: 'setCell',
            sheetId: sheet.id,
            address: addr,
            next,
          });
          continue;
        }
        const existing = sheet.getCell(addr);
        const next: Cell = {
          raw: clip.raw,
          value: clip.value,
          format: clip.format,
          styleId: clip.styleId ?? existing?.styleId,
          comment: existing?.comment,
          validationId: existing?.validationId,
        };
        workbook.apply({
          kind: 'setCell',
          sheetId: sheet.id,
          address: addr,
          next,
        });
      }
    }
  });
}

/** Split plain clipboard text into a 2D array, auto-detecting tab vs comma. */
export function parseClipboardText(text: string): string[][] {
  // Strip a single trailing newline (most clipboards add one).
  const trimmed = text.replace(/(\r\n|\n|\r)$/, '');
  const delim = trimmed.includes('\t') ? '\t' : ',';
  return parseCsv(trimmed, { delimiter: delim });
}

export function pastePlain(
  workbook: Workbook,
  sheet: Sheet,
  target: Address,
  text: string,
): void {
  const rows = parseClipboardText(text);
  if (rows.length === 0) return;
  workbook.batch(() => {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      for (let c = 0; c < row.length; c++) {
        const addr = { row: target.row + r, col: target.col + c };
        // setCellFromInput preserves existing cell styling.
        workbook.setCellFromInput(sheet.id, addr, row[c] ?? '');
      }
    }
  });
}

export function clearRange(
  workbook: Workbook,
  sheet: Sheet,
  range: RangeAddress,
): void {
  const r = normalizeRange(range);
  workbook.batch(() => {
    for (let row = r.start.row; row <= r.end.row; row++) {
      for (let col = r.start.col; col <= r.end.col; col++) {
        workbook.setCellFromInput(sheet.id, { row, col }, '');
      }
    }
  });
}
