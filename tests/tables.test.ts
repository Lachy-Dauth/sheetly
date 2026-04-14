import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import {
  columnIndexByName,
  dataRange,
  makeTable,
  resolveStructuredRange,
} from '../src/engine/tables';
import { computeHiddenRows } from '../src/engine/table-filters';

function seedPeople(wb: Workbook) {
  const s = wb.sheets[0]!;
  const rows: Array<[string, string, number]> = [
    ['Name', 'Dept', 0], // header row (third value ignored)
    ['Ada', 'Eng', 90],
    ['Bert', 'Ops', 70],
    ['Cara', 'Eng', 85],
    ['Dan', 'Sales', 60],
  ];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    wb.setCellFromInput(s.id, { row: r, col: 0 }, row[0]);
    wb.setCellFromInput(s.id, { row: r, col: 1 }, row[1]);
    wb.setCellFromInput(s.id, { row: r, col: 2 }, r === 0 ? 'Score' : String(row[2]));
  }
  return s;
}

describe('Tables: model', () => {
  it('makeTable derives columns and data range', () => {
    const t = makeTable({
      name: 'T',
      sheetId: 's1',
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } },
      headerNames: ['A', 'B', 'C'],
    });
    expect(t.columns.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    expect(dataRange(t)).toEqual({ startRow: 1, endRow: 4 });
    expect(columnIndexByName(t, 'b')).toBe(1);
  });

  it('resolveStructuredRange handles #Headers, #Data, @Col, and plain name', () => {
    const t = makeTable({
      name: 'T',
      sheetId: 's1',
      range: { start: { row: 2, col: 1 }, end: { row: 6, col: 3 } },
      headerNames: ['A', 'B', 'C'],
    });
    expect(resolveStructuredRange(t, '#Headers')).toEqual({
      start: { row: 2, col: 1 },
      end: { row: 2, col: 3 },
    });
    expect(resolveStructuredRange(t, '#Data')).toEqual({
      start: { row: 3, col: 1 },
      end: { row: 6, col: 3 },
    });
    expect(resolveStructuredRange(t, 'B')).toEqual({
      start: { row: 3, col: 2 },
      end: { row: 6, col: 2 },
    });
    expect(resolveStructuredRange(t, '@C', { row: 5, col: 1 })).toEqual({
      start: { row: 5, col: 3 },
      end: { row: 5, col: 3 },
    });
  });
});

describe('Tables: workbook integration', () => {
  it('createTable registers and styles the header row', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    const t = wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    expect(wb.tables.byNameCI(t.name)).toBe(t);
    const header = s.getCell({ row: 0, col: 0 });
    expect(header?.styleId).toBeDefined();
    const style = wb.styles.get(header!.styleId!);
    expect(style.bold).toBe(true);
  });

  it('expands when a cell is edited just below the table', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    const t = wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    wb.setCellFromInput(s.id, { row: 5, col: 0 }, 'Eve');
    expect(wb.tables.get(t.id)!.range.end.row).toBe(5);
  });
});

describe('Tables: structured refs in formulas', () => {
  it('SUM over a plain column spec', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    wb.createTable(s.id, {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 2 },
      // auto header detection
    });
    wb.setCellFromInput(s.id, { row: 6, col: 0 }, '=SUM(Table1[Score])');
    expect(s.getCell({ row: 6, col: 0 })?.computed).toBe(90 + 70 + 85 + 60);
  });

  it('[@Col] returns the current row value', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    // Include col 3 in the table so the formula cell is inside it.
    wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 3 } });
    wb.setCellFromInput(s.id, { row: 2, col: 3 }, '=[@Score]*2');
    expect(s.getCell({ row: 2, col: 3 })?.computed).toBe(140);
  });

  it('unknown table name returns #REF!', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, '=SUM(NoSuch[Col])');
    const v = s.getCell({ row: 0, col: 0 })?.computed;
    expect(v && typeof v === 'object' && 'code' in v ? v.code : null).toBe('#REF!');
  });
});

describe('Tables: filters', () => {
  it('hides rows that fail the value filter', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    const t = wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    // Show only Eng rows.
    wb.setColumnFilter(t.id, 1, { values: new Set(['Eng']) });
    const hidden = computeHiddenRows(wb.tables.get(t.id)!, s);
    // Rows 1 (Ada/Eng) and 3 (Cara/Eng) visible; 2 (Bert/Ops) and 4 (Dan/Sales) hidden.
    expect(hidden.has(1)).toBe(false);
    expect(hidden.has(2)).toBe(true);
    expect(hidden.has(3)).toBe(false);
    expect(hidden.has(4)).toBe(true);
    // Sheet row meta is updated for hidden rows.
    expect(s.rows.get(2)?.hidden).toBe(true);
    expect(s.rows.get(1)?.hidden ?? false).toBe(false);
  });

  it('numeric condition filter', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    const t = wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    wb.setColumnFilter(t.id, 2, { condition: { op: '>=', value: 80 } });
    const hidden = computeHiddenRows(wb.tables.get(t.id)!, s);
    // Scores: 90, 70, 85, 60 -> keep 90 and 85 (rows 1 and 3).
    expect(hidden.has(1)).toBe(false);
    expect(hidden.has(2)).toBe(true);
    expect(hidden.has(3)).toBe(false);
    expect(hidden.has(4)).toBe(true);
  });

  it('clearing a filter restores rows', () => {
    const wb = Workbook.createDefault();
    seedPeople(wb);
    const s = wb.sheets[0]!;
    const t = wb.createTable(s.id, { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    wb.setColumnFilter(t.id, 1, { values: new Set(['Eng']) });
    wb.setColumnFilter(t.id, 1, undefined);
    for (let r = 1; r <= 4; r++) {
      expect(s.rows.get(r)?.hidden ?? false).toBe(false);
    }
  });
});
