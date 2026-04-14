import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import {
  findAll,
  replaceAll,
  sortRange,
  dedupeRange,
  textToColumns,
} from '../src/engine/data-ops';

function wb() {
  const w = Workbook.createDefault();
  return { w, s: w.sheets[0]! };
}

describe('find & replace', () => {
  it('findAll returns exact matches in a range', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'hello world');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'HELLO there');
    const hits = findAll(s, { pattern: 'hello' });
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.address.row).sort()).toEqual([0, 1]);
  });

  it('findAll honours case sensitivity and wholeCell', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'hello');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'Hello');
    expect(findAll(s, { pattern: 'hello', caseSensitive: true })).toHaveLength(1);
    expect(findAll(s, { pattern: 'hello', wholeCell: true })).toHaveLength(2);
  });

  it('findAll supports regex', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'abc123');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'foo');
    const hits = findAll(s, { pattern: '\\d+', regex: true });
    expect(hits).toHaveLength(1);
  });

  it('replaceAll edits matching cells and is undo-able', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'red car');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'red bike');
    const count = replaceAll(w, s, { pattern: 'red', replacement: 'blue' });
    expect(count).toBe(2);
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('blue car');
    w.undo();
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('red car');
  });

  it('replaceAll with regex handles multiple cells correctly', () => {
    // Regression test: using a `g`-flag RegExp across cells via .test() used
    // to advance lastIndex between iterations, causing later cells to miss
    // matches that the prior call had already scanned past.
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'abc123');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'xy');
    w.setCellFromInput(s.id, { row: 2, col: 0 }, 'xyz456');
    const count = replaceAll(w, s, { pattern: '\\d+', regex: true, replacement: '#' });
    expect(count).toBe(2);
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('abc#');
    expect(s.getCell({ row: 2, col: 0 })?.raw).toBe('xyz#');
  });

  it('findAll reports full match length for regex hits', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'foo_1234_bar');
    const hits = findAll(s, { pattern: '\\d+', regex: true });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.start).toBe(4);
    expect(hits[0]!.end).toBe(8);
  });
});

describe('sort', () => {
  it('sorts ascending by a single key', () => {
    const { w, s } = wb();
    const rows = [['b', 2], ['a', 1], ['c', 3]];
    for (let r = 0; r < rows.length; r++) {
      w.setCellFromInput(s.id, { row: r, col: 0 }, String(rows[r]![0]));
      w.setCellFromInput(s.id, { row: r, col: 1 }, String(rows[r]![1]));
    }
    sortRange(w, s, { start: { row: 0, col: 0 }, end: { row: 2, col: 1 } }, [{ col: 0, ascending: true }]);
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('a');
    expect(s.getCell({ row: 1, col: 0 })?.raw).toBe('b');
    expect(s.getCell({ row: 2, col: 0 })?.raw).toBe('c');
    // Row companions move together.
    expect(s.getCell({ row: 0, col: 1 })?.value).toBe(1);
  });

  it('skips the header row', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'Name');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'zoe');
    w.setCellFromInput(s.id, { row: 2, col: 0 }, 'amy');
    sortRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
      [{ col: 0, ascending: true }],
      { headerRow: true },
    );
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('Name');
    expect(s.getCell({ row: 1, col: 0 })?.raw).toBe('amy');
  });

  it('multi-key sort breaks ties', () => {
    const { w, s } = wb();
    const rows: Array<[string, number]> = [
      ['a', 3],
      ['b', 1],
      ['a', 1],
      ['b', 2],
    ];
    for (let r = 0; r < rows.length; r++) {
      w.setCellFromInput(s.id, { row: r, col: 0 }, rows[r]![0]);
      w.setCellFromInput(s.id, { row: r, col: 1 }, String(rows[r]![1]));
    }
    sortRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
      [{ col: 0, ascending: true }, { col: 1, ascending: true }],
    );
    expect([0, 1, 2, 3].map((r) => s.getCell({ row: r, col: 0 })?.raw)).toEqual(['a', 'a', 'b', 'b']);
    expect([0, 1, 2, 3].map((r) => s.getCell({ row: r, col: 1 })?.value)).toEqual([1, 3, 1, 2]);
  });
});

describe('dedupe', () => {
  it('removes duplicate rows', () => {
    const { w, s } = wb();
    const rows = ['a', 'b', 'a', 'c', 'b'];
    for (let r = 0; r < rows.length; r++) w.setCellFromInput(s.id, { row: r, col: 0 }, rows[r]!);
    const removed = dedupeRange(w, s, { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } });
    expect(removed).toBe(2);
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('a');
    expect(s.getCell({ row: 1, col: 0 })?.raw).toBe('b');
    expect(s.getCell({ row: 2, col: 0 })?.raw).toBe('c');
    expect(s.getCell({ row: 3, col: 0 })).toBeUndefined();
  });
});

describe('text to columns', () => {
  it('splits on a comma delimiter', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'a,b,c');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'x,y');
    textToColumns(w, s, { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } }, {
      delimiter: ',',
    });
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('a');
    expect(s.getCell({ row: 0, col: 1 })?.raw).toBe('b');
    expect(s.getCell({ row: 0, col: 2 })?.raw).toBe('c');
    expect(s.getCell({ row: 1, col: 1 })?.raw).toBe('y');
  });
});
