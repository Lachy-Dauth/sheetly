import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { detectDelimiter, parseCsv, escapeField, streamCsv } from '../src/io/csv-parse';
import { importCsv, serializeSheetCsv } from '../src/io/csv';

describe('CSV parser', () => {
  it('parses simple comma separated values', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with commas and quotes', () => {
    expect(parseCsv('"a,b","c""d"')).toEqual([['a,b', 'c"d']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles multi-line quoted fields', () => {
    expect(parseCsv('"a\nb",c')).toEqual([['a\nb', 'c']]);
  });

  it('honours custom delimiters', () => {
    expect(parseCsv('a;b\n1;2', { delimiter: ';' })).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('CSV utilities', () => {
  it('detects comma delimiter', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',');
  });
  it('detects tab delimiter', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3\n4\t5\t6')).toBe('\t');
  });
  it('detects pipe delimiter', () => {
    expect(detectDelimiter('a|b|c\n1|2|3\n4|5|6')).toBe('|');
  });

  it('escapes fields with special characters', () => {
    expect(escapeField('hello')).toBe('hello');
    expect(escapeField('a,b')).toBe('"a,b"');
    expect(escapeField('a"b')).toBe('"a""b"');
    expect(escapeField('a\nb')).toBe('"a\nb"');
  });
});

describe('CSV import/export integration', () => {
  it('imports values and infers types', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    importCsv(wb, s.id, 'a,b,c\n1,2,3\n4,5,6');
    expect(s.getCell({ row: 0, col: 0 })?.value).toBe('a');
    expect(s.getCell({ row: 1, col: 0 })?.value).toBe(1);
    expect(s.getCell({ row: 2, col: 2 })?.value).toBe(6);
  });

  it('round-trips through serializeSheetCsv', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    importCsv(wb, s.id, 'a,b\n1,2\n', { inferTypes: false });
    const out = serializeSheetCsv(s, { trimEmpty: true });
    expect(out.split(/\r?\n/).slice(0, 2)).toEqual(['a,b', '1,2']);
  });

  it('escapes special fields on export', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    s.setCell({ row: 0, col: 0 }, { raw: 'a,b', value: 'a,b' });
    s.setCell({ row: 0, col: 1 }, { raw: 'x"y', value: 'x"y' });
    const out = serializeSheetCsv(s, { trimEmpty: true });
    expect(out).toBe('"a,b","x""y"');
  });
});

describe('CSV streaming', () => {
  it('streams rows one at a time', async () => {
    async function* src() {
      yield 'a,b,c\n';
      yield '1,2,3\n4,';
      yield '5,6\n';
    }
    const rows: string[][] = [];
    await streamCsv(src(), (row) => {
      rows.push(row);
    });
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });
});
