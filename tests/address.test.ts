import { describe, expect, it } from 'vitest';
import {
  a1ToAddress,
  addressToA1,
  cellKey,
  colToLetters,
  fromCellKey,
  lettersToCol,
  parseRef,
  rangeCells,
  rangeToA1,
} from '../src/engine/address';

describe('address math', () => {
  it('converts columns to letters and back', () => {
    expect(colToLetters(0)).toBe('A');
    expect(colToLetters(25)).toBe('Z');
    expect(colToLetters(26)).toBe('AA');
    expect(colToLetters(701)).toBe('ZZ');
    expect(colToLetters(702)).toBe('AAA');

    expect(lettersToCol('A')).toBe(0);
    expect(lettersToCol('Z')).toBe(25);
    expect(lettersToCol('AA')).toBe(26);
    expect(lettersToCol('ZZ')).toBe(701);
    expect(lettersToCol('AAA')).toBe(702);
  });

  it('round-trips A1 addresses', () => {
    for (const a of ['A1', 'B2', 'AA10', 'ZZ999']) {
      expect(addressToA1(a1ToAddress(a))).toBe(a);
    }
  });

  it('packs cell keys uniquely', () => {
    const k = cellKey(42, 7);
    expect(fromCellKey(k)).toEqual({ row: 42, col: 7 });
  });
});

describe('parseRef', () => {
  it('parses plain cell refs', () => {
    const r = parseRef('A1');
    expect(r?.kind).toBe('cell');
    expect(r?.start).toEqual({ row: 0, col: 0 });
  });

  it('parses absolute markers', () => {
    const r = parseRef('$B$3');
    expect(r?.absCol).toBe(true);
    expect(r?.absRow).toBe(true);
    expect(r?.start).toEqual({ row: 2, col: 1 });
  });

  it('parses range refs', () => {
    const r = parseRef('A1:B10');
    expect(r?.kind).toBe('range');
    expect(r?.start).toEqual({ row: 0, col: 0 });
    expect(r?.end).toEqual({ row: 9, col: 1 });
  });

  it('parses cross-sheet refs', () => {
    const r = parseRef('Sheet1!A1:B2');
    expect(r?.sheet).toBe('Sheet1');
  });

  it('parses quoted sheet names', () => {
    const r = parseRef("'My Sheet'!A1");
    expect(r?.sheet).toBe('My Sheet');
  });

  it('rejects invalid refs', () => {
    expect(parseRef('')).toBeNull();
    expect(parseRef('1A')).toBeNull();
  });
});

describe('range iteration', () => {
  it('yields every cell in order', () => {
    const out = Array.from(
      rangeCells({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }),
    );
    expect(out).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it('formats a range back to A1', () => {
    const r = parseRef('A1:C5')!;
    expect(rangeToA1({ start: r.start, end: r.end })).toBe('A1:C5');
  });
});
