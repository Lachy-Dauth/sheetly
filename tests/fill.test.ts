import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { fillExtent, fillRange, shiftFormula } from '../src/grid/fill';

function wb() {
  const w = Workbook.createDefault();
  return { w, s: w.sheets[0]! };
}

describe('fillExtent', () => {
  it('extends downward when target is below the source', () => {
    const ext = fillExtent(
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { row: 4, col: 0 },
    );
    expect(ext?.direction).toBe('down');
    expect(ext?.dest).toEqual({ start: { row: 1, col: 0 }, end: { row: 4, col: 0 } });
  });

  it('returns null when the target sits inside the source', () => {
    expect(
      fillExtent({ start: { row: 0, col: 0 }, end: { row: 5, col: 5 } }, { row: 2, col: 2 }),
    ).toBeNull();
  });

  it('extends rightward across the full source row span', () => {
    const ext = fillExtent(
      { start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
      { row: 2, col: 5 },
    );
    expect(ext?.direction).toBe('right');
    expect(ext?.dest).toEqual({ start: { row: 0, col: 2 }, end: { row: 2, col: 5 } });
  });
});

describe('shiftFormula', () => {
  it('shifts relative refs and pins absolute parts', () => {
    expect(shiftFormula('=A1+$B$1+$C1+D$1', 2, 1)).toBe('=B3+$B$1+$C3+E$1');
  });
  it('shifts both ends of a range', () => {
    expect(shiftFormula('=SUM(A1:B2)', 3, 0)).toBe('=SUM(A4:B5)');
  });
  it('emits #REF! for negative results', () => {
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
  });
  it('leaves strings, errors, and idents alone', () => {
    expect(shiftFormula('=IF(A1>0,"yes","no")', 1, 0)).toBe('=IF(A2>0,"yes","no")');
  });
});

describe('fillRange numbers', () => {
  it('extends an arithmetic series downward', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '1');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '2');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      { start: { row: 2, col: 0 }, end: { row: 5, col: 0 } },
      'down',
    );
    expect(s.getCell({ row: 2, col: 0 })?.value).toBe(3);
    expect(s.getCell({ row: 5, col: 0 })?.value).toBe(6);
  });

  it('repeats a single number rather than extrapolating', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '7');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
      'down',
    );
    expect(s.getCell({ row: 1, col: 0 })?.value).toBe(7);
    expect(s.getCell({ row: 3, col: 0 })?.value).toBe(7);
  });

  it('extends upward correctly', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 5, col: 0 }, '10');
    w.setCellFromInput(s.id, { row: 6, col: 0 }, '11');
    fillRange(
      w,
      s,
      { start: { row: 5, col: 0 }, end: { row: 6, col: 0 } },
      { start: { row: 2, col: 0 }, end: { row: 4, col: 0 } },
      'up',
    );
    expect(s.getCell({ row: 4, col: 0 })?.value).toBe(9);
    expect(s.getCell({ row: 3, col: 0 })?.value).toBe(8);
    expect(s.getCell({ row: 2, col: 0 })?.value).toBe(7);
  });

  it('is undo-able as a single step', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '1');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '2');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      { start: { row: 2, col: 0 }, end: { row: 4, col: 0 } },
      'down',
    );
    expect(s.getCell({ row: 4, col: 0 })?.value).toBe(5);
    w.undo();
    expect(s.getCell({ row: 4, col: 0 })).toBeUndefined();
  });
});

describe('fillRange formulas', () => {
  it('shifts relative refs when filling down, pins absolute refs', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '=B1+$C$1');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      'down',
    );
    expect(s.getCell({ row: 1, col: 0 })?.raw).toBe('=B2+$C$1');
    expect(s.getCell({ row: 2, col: 0 })?.raw).toBe('=B3+$C$1');
  });

  it('shifts column refs when filling right', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '=A2*2');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { start: { row: 0, col: 1 }, end: { row: 0, col: 2 } },
      'right',
    );
    expect(s.getCell({ row: 0, col: 1 })?.raw).toBe('=B2*2');
    expect(s.getCell({ row: 0, col: 2 })?.raw).toBe('=C2*2');
  });
});

describe('fillRange text', () => {
  it('repeats text values verbatim', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, 'hi');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, 'bye');
    fillRange(
      w,
      s,
      { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      { start: { row: 2, col: 0 }, end: { row: 5, col: 0 } },
      'down',
    );
    expect(s.getCell({ row: 2, col: 0 })?.raw).toBe('hi');
    expect(s.getCell({ row: 3, col: 0 })?.raw).toBe('bye');
    expect(s.getCell({ row: 4, col: 0 })?.raw).toBe('hi');
    expect(s.getCell({ row: 5, col: 0 })?.raw).toBe('bye');
  });
});
