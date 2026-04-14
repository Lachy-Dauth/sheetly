import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import type { Address } from '../src/engine/address';
import { isErrorValue } from '../src/engine/cell';

function wb() {
  const w = Workbook.createDefault();
  return { w, s: w.sheets[0]! };
}

function eval$(formula: string, at: Address = { row: 9, col: 9 }) {
  const { w, s } = wb();
  w.setCellFromInput(s.id, at, formula);
  return s.getCell(at)?.computed ?? null;
}

describe('formula: arithmetic', () => {
  it('evaluates +,-,*,/,^', () => {
    expect(eval$('=1+2')).toBe(3);
    expect(eval$('=10-4')).toBe(6);
    expect(eval$('=3*4')).toBe(12);
    expect(eval$('=10/4')).toBe(2.5);
    expect(eval$('=2^10')).toBe(1024);
  });
  it('honours precedence', () => {
    expect(eval$('=1+2*3')).toBe(7);
    expect(eval$('=(1+2)*3')).toBe(9);
    // Excel: unary minus binds tighter than ^, so -2^2 = 4 (not -4).
    expect(eval$('=-2^2')).toBe(4);
    expect(eval$('=-(2^2)')).toBe(-4);
  });
  it('returns #DIV/0! on zero divide', () => {
    const v = eval$('=1/0');
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#DIV/0!');
  });
  it('concatenates with &', () => {
    expect(eval$('="foo"&"bar"')).toBe('foobar');
  });
  it('compares', () => {
    expect(eval$('=1<2')).toBe(true);
    expect(eval$('=2<=2')).toBe(true);
    expect(eval$('=2<>2')).toBe(false);
    expect(eval$('=1=1')).toBe(true);
  });
  it('handles percent postfix', () => {
    expect(eval$('=50%')).toBe(0.5);
  });
});

describe('formula: refs', () => {
  it('resolves A1 refs', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '7');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '=A1*2');
    expect(s.getCell({ row: 1, col: 0 })?.computed).toBe(14);
  });

  it('recomputes transitively', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '1');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '=A1+1');
    w.setCellFromInput(s.id, { row: 2, col: 0 }, '=A2+1');
    expect(s.getCell({ row: 2, col: 0 })?.computed).toBe(3);
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '10');
    expect(s.getCell({ row: 2, col: 0 })?.computed).toBe(12);
  });

  it('detects cycles', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '=A2');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '=A1');
    const v = s.getCell({ row: 0, col: 0 })?.computed;
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#CIRC!');
  });
});

describe('formula: math functions', () => {
  it('SUM across a range', () => {
    const { w, s } = wb();
    for (let r = 0; r < 5; r++) w.setCellFromInput(s.id, { row: r, col: 0 }, String(r + 1));
    w.setCellFromInput(s.id, { row: 0, col: 1 }, '=SUM(A1:A5)');
    expect(s.getCell({ row: 0, col: 1 })?.computed).toBe(15);
  });
  it('ROUND / FLOOR / CEILING', () => {
    expect(eval$('=ROUND(3.14159,2)')).toBe(3.14);
    expect(eval$('=FLOOR(9,4)')).toBe(8);
    expect(eval$('=CEILING(9,4)')).toBe(12);
  });
  it('SUMIF with >', () => {
    const { w, s } = wb();
    for (let r = 0; r < 5; r++) w.setCellFromInput(s.id, { row: r, col: 0 }, String(r + 1));
    w.setCellFromInput(s.id, { row: 0, col: 1 }, '=SUMIF(A1:A5,">2")');
    expect(s.getCell({ row: 0, col: 1 })?.computed).toBe(12);
  });
  it('MIN/MAX/MEDIAN', () => {
    const { w, s } = wb();
    [5, 3, 8, 1, 4].forEach((v, r) => w.setCellFromInput(s.id, { row: r, col: 0 }, String(v)));
    w.setCellFromInput(s.id, { row: 0, col: 1 }, '=MIN(A1:A5)');
    w.setCellFromInput(s.id, { row: 1, col: 1 }, '=MAX(A1:A5)');
    w.setCellFromInput(s.id, { row: 2, col: 1 }, '=MEDIAN(A1:A5)');
    expect(s.getCell({ row: 0, col: 1 })?.computed).toBe(1);
    expect(s.getCell({ row: 1, col: 1 })?.computed).toBe(8);
    expect(s.getCell({ row: 2, col: 1 })?.computed).toBe(4);
  });
});

describe('formula: text functions', () => {
  it('LEFT/RIGHT/MID/LEN', () => {
    expect(eval$('=LEFT("hello",3)')).toBe('hel');
    expect(eval$('=RIGHT("hello",2)')).toBe('lo');
    expect(eval$('=MID("hello",2,3)')).toBe('ell');
    expect(eval$('=LEN("hello")')).toBe(5);
  });
  it('UPPER/LOWER/PROPER/TRIM', () => {
    expect(eval$('=UPPER("abc")')).toBe('ABC');
    expect(eval$('=LOWER("ABC")')).toBe('abc');
    expect(eval$('=PROPER("hello world")')).toBe('Hello World');
    expect(eval$('=TRIM("  a   b  ")')).toBe('a b');
  });
  it('SUBSTITUTE/REPLACE/FIND', () => {
    expect(eval$('=SUBSTITUTE("a-b-c","-","/")')).toBe('a/b/c');
    expect(eval$('=REPLACE("hello",2,3,"X")')).toBe('hXo');
    expect(eval$('=FIND("lo","hello")')).toBe(4);
  });
});

describe('formula: logical', () => {
  it('IF/AND/OR/NOT', () => {
    expect(eval$('=IF(TRUE,1,2)')).toBe(1);
    expect(eval$('=IF(FALSE,1,2)')).toBe(2);
    expect(eval$('=AND(TRUE,TRUE,FALSE)')).toBe(false);
    expect(eval$('=OR(FALSE,FALSE,TRUE)')).toBe(true);
    expect(eval$('=NOT(TRUE)')).toBe(false);
  });
  it('IFERROR', () => {
    expect(eval$('=IFERROR(1/0,"oops")')).toBe('oops');
    expect(eval$('=IFERROR(1/1,"oops")')).toBe(1);
  });
  it('AND/OR/XOR with no logical args return #VALUE!', () => {
    // Excel returns #VALUE! when AND/OR/XOR receive no logical arguments.
    const a = eval$('=AND()');
    expect(isErrorValue(a)).toBe(true);
    if (isErrorValue(a)) expect(a.code).toBe('#VALUE!');
    const o = eval$('=OR()');
    expect(isErrorValue(o)).toBe(true);
    const x = eval$('=XOR()');
    expect(isErrorValue(x)).toBe(true);
  });
});

describe('formula: lookup', () => {
  it('VLOOKUP exact', () => {
    const { w, s } = wb();
    [['a', 1], ['b', 2], ['c', 3]].forEach(([k, v], r) => {
      w.setCellFromInput(s.id, { row: r, col: 0 }, String(k));
      w.setCellFromInput(s.id, { row: r, col: 1 }, String(v));
    });
    w.setCellFromInput(s.id, { row: 0, col: 3 }, '=VLOOKUP("b",A1:B3,2,FALSE)');
    expect(s.getCell({ row: 0, col: 3 })?.computed).toBe(2);
  });
  it('INDEX/MATCH', () => {
    const { w, s } = wb();
    for (let r = 0; r < 3; r++) {
      w.setCellFromInput(s.id, { row: r, col: 0 }, String(r + 1));
      w.setCellFromInput(s.id, { row: r, col: 1 }, `val${r}`);
    }
    w.setCellFromInput(s.id, { row: 0, col: 3 }, '=INDEX(B1:B3,MATCH(2,A1:A3,0))');
    expect(s.getCell({ row: 0, col: 3 })?.computed).toBe('val1');
  });
  it('XMATCH honours match_mode and search_mode', () => {
    const { w, s } = wb();
    [10, 20, 30, 40, 50].forEach((v, r) => {
      w.setCellFromInput(s.id, { row: r, col: 0 }, String(v));
    });
    // Exact match (default).
    w.setCellFromInput(s.id, { row: 0, col: 2 }, '=XMATCH(30,A1:A5)');
    expect(s.getCell({ row: 0, col: 2 })?.computed).toBe(3);
    // match_mode = -1: exact or next smaller.
    w.setCellFromInput(s.id, { row: 1, col: 2 }, '=XMATCH(35,A1:A5,-1)');
    expect(s.getCell({ row: 1, col: 2 })?.computed).toBe(3);
    // match_mode = 1: exact or next larger.
    w.setCellFromInput(s.id, { row: 2, col: 2 }, '=XMATCH(35,A1:A5,1)');
    expect(s.getCell({ row: 2, col: 2 })?.computed).toBe(4);
    // search_mode = -1: search last-to-first; finding duplicates returns the last.
    w.setCellFromInput(s.id, { row: 5, col: 0 }, '30');
    w.setCellFromInput(s.id, { row: 3, col: 2 }, '=XMATCH(30,A1:A6,0,-1)');
    expect(s.getCell({ row: 3, col: 2 })?.computed).toBe(6);
  });
  it('XMATCH wildcard mode', () => {
    const { w, s } = wb();
    ['apple', 'banana', 'cherry'].forEach((v, r) => {
      w.setCellFromInput(s.id, { row: r, col: 0 }, v);
    });
    w.setCellFromInput(s.id, { row: 0, col: 2 }, '=XMATCH("ban*",A1:A3,2)');
    expect(s.getCell({ row: 0, col: 2 })?.computed).toBe(2);
  });
});

describe('formula: info', () => {
  it('ISNUMBER/ISTEXT/ISBLANK', () => {
    expect(eval$('=ISNUMBER(5)')).toBe(true);
    expect(eval$('=ISTEXT("x")')).toBe(true);
    expect(eval$('=ISBLANK(A1)')).toBe(true);
  });
});

describe('formula: named ranges', () => {
  it('recalculates dependent formulas when underlying cell changes', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '5');
    w.setName('Foo', 'A1');
    w.setCellFromInput(s.id, { row: 0, col: 1 }, '=Foo*2');
    expect(s.getCell({ row: 0, col: 1 })?.computed).toBe(10);
    // Update A1 — formula referencing the named range should recalc.
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '7');
    expect(s.getCell({ row: 0, col: 1 })?.computed).toBe(14);
  });
});

describe('formula: financial', () => {
  it('NPER with pmt=0 and r=0 returns #NUM! instead of NaN', () => {
    const v = eval$('=NPER(0,0,1000,-2000)');
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#NUM!');
  });
  it('NPER returns #NUM! when log argument would be non-positive', () => {
    // pv*r + pmt*(1+r*type) = 0 → ratio undefined; or numerator non-positive.
    const v = eval$('=NPER(0.1,1,-100,-100)');
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#NUM!');
  });
  it('NPER computes valid case', () => {
    // PV=-1000 (loan), PMT=200/period, no FV. ~5.36 periods.
    const v = eval$('=NPER(0,200,-1000,0)');
    expect(v).toBeCloseTo(5, 5);
  });
});

describe('formula: math', () => {
  it('SUMPRODUCT errors on mismatched array sizes', () => {
    const { w, s } = wb();
    [1, 2, 3].forEach((v, r) => w.setCellFromInput(s.id, { row: r, col: 0 }, String(v)));
    [10, 20].forEach((v, r) => w.setCellFromInput(s.id, { row: r, col: 1 }, String(v)));
    w.setCellFromInput(s.id, { row: 0, col: 3 }, '=SUMPRODUCT(A1:A3,B1:B2)');
    const v = s.getCell({ row: 0, col: 3 })?.computed;
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#VALUE!');
  });
});

describe('formula: array', () => {
  it('SORT errors on out-of-bounds sort index', () => {
    const { w, s } = wb();
    w.setCellFromInput(s.id, { row: 0, col: 0 }, '3');
    w.setCellFromInput(s.id, { row: 1, col: 0 }, '1');
    w.setCellFromInput(s.id, { row: 0, col: 1 }, '=SORT(A1:A2,5)');
    const v = s.getCell({ row: 0, col: 1 })?.computed;
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#VALUE!');
  });
});

describe('formula: error in name', () => {
  it('unknown function returns #NAME?', () => {
    const v = eval$('=NOPE(1)');
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#NAME?');
  });
});

describe('formula: datetime', () => {
  it('WEEKNUM honours mode (Sun vs Mon start)', () => {
    // 2024-01-01 is a Monday.
    expect(eval$('=WEEKNUM(DATE(2024,1,1))')).toBe(1);
    // Mode 1: Sunday is week boundary, so the Sunday before (2023-12-31) starts week 1.
    // Jan 7 (Sun) starts week 2 → Jan 8 (Mon) is week 2.
    expect(eval$('=WEEKNUM(DATE(2024,1,8),1)')).toBe(2);
    // Mode 2: Monday is week boundary, so Jan 1 (Mon) starts week 1; Jan 8 starts week 2.
    expect(eval$('=WEEKNUM(DATE(2024,1,8),2)')).toBe(2);
    // ISO week (mode 21): 2024-01-01 (Mon) starts ISO week 1.
    expect(eval$('=WEEKNUM(DATE(2024,1,1),21)')).toBe(1);
    // 2023-01-01 (Sun) is in ISO week 52 of 2022.
    expect(eval$('=WEEKNUM(DATE(2023,1,1),21)')).toBe(52);
  });
  it('NETWORKDAYS returns negative when end < start', () => {
    // 2024-01-01 (Mon) to 2024-01-05 (Fri) = 5 working days.
    expect(eval$('=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,5))')).toBe(5);
    // Reversed should be -5.
    expect(eval$('=NETWORKDAYS(DATE(2024,1,5),DATE(2024,1,1))')).toBe(-5);
  });
  it('DATEDIF returns #NUM! when end < start, and supports YM/YD/MD', () => {
    const v = eval$('=DATEDIF(DATE(2024,6,1),DATE(2024,5,1),"D")');
    expect(isErrorValue(v)).toBe(true);
    if (isErrorValue(v)) expect(v.code).toBe('#NUM!');
    // YM: months ignoring years.
    expect(eval$('=DATEDIF(DATE(2020,3,15),DATE(2024,9,20),"YM")')).toBe(6);
    // MD: days ignoring months & years.
    expect(eval$('=DATEDIF(DATE(2020,3,15),DATE(2024,9,20),"MD")')).toBe(5);
  });
});
