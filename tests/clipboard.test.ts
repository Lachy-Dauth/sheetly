import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import {
  SHEETLY_CLIPBOARD_MIME,
  buildRichPayload,
  buildTsv,
  parseClipboardText,
  pasteRich,
  pastePlain,
} from '../src/grid/clipboard';

/** Tiny in-memory stub of a DataTransfer. */
class FakeDataTransfer {
  private store = new Map<string, string>();
  setData(mime: string, data: string): void {
    this.store.set(mime, data);
  }
  getData(mime: string): string {
    return this.store.get(mime) ?? '';
  }
  get types(): string[] {
    return Array.from(this.store.keys());
  }
}

describe('grid clipboard helpers', () => {
  it('buildTsv joins cells with tab and CRLF', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, 'a');
    wb.setCellFromInput(s.id, { row: 0, col: 1 }, 'b');
    wb.setCellFromInput(s.id, { row: 1, col: 0 }, '1');
    wb.setCellFromInput(s.id, { row: 1, col: 1 }, '2');
    const tsv = buildTsv(s, { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    expect(tsv).toBe('a\tb\r\n1\t2');
  });

  it('buildTsv quotes fields containing tabs or newlines', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, 'has\ttab');
    wb.setCellFromInput(s.id, { row: 0, col: 1 }, 'plain');
    const tsv = buildTsv(s, { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } });
    expect(tsv).toBe('"has\ttab"\tplain');
  });

  it('buildTsv uses computed value for formulas', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, '=1+2');
    const tsv = buildTsv(s, { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
    expect(tsv).toBe('3');
  });

  it('parseClipboardText auto-detects tab vs comma delimiter', () => {
    expect(parseClipboardText('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseClipboardText('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('pastePlain writes parsed values into target block', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    pastePlain(wb, s, { row: 2, col: 1 }, 'x\ty\n10\t20');
    expect(s.getCell({ row: 2, col: 1 })?.raw).toBe('x');
    expect(s.getCell({ row: 2, col: 2 })?.raw).toBe('y');
    expect(s.getCell({ row: 3, col: 1 })?.value).toBe(10);
    expect(s.getCell({ row: 3, col: 2 })?.value).toBe(20);
  });

  it('pasteRich copies raw values and styleIds to the target', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, 'source');
    wb.setStyle(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { bold: true },
    );
    const payload = buildRichPayload(s, {
      start: { row: 0, col: 0 },
      end: { row: 0, col: 0 },
    });
    pasteRich(wb, s, { row: 5, col: 3 }, payload);
    const dst = s.getCell({ row: 5, col: 3 });
    expect(dst?.raw).toBe('source');
    expect(dst?.styleId).toBeDefined();
    expect(wb.styles.get(dst!.styleId!)).toMatchObject({ bold: true });
  });

  it('round-trips rich payload through SHEETLY_CLIPBOARD_MIME', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, '=6*7');
    const payload = buildRichPayload(s, {
      start: { row: 0, col: 0 },
      end: { row: 0, col: 0 },
    });
    const dt = new FakeDataTransfer();
    dt.setData(SHEETLY_CLIPBOARD_MIME, JSON.stringify(payload));
    const parsed = JSON.parse(dt.getData(SHEETLY_CLIPBOARD_MIME));
    expect(parsed.cells[0][0].raw).toBe('=6*7');
  });
});
