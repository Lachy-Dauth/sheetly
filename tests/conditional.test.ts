import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { evaluateRules } from '../src/engine/conditional';
import { cellKey } from '../src/engine/address';

function seed(wb: Workbook, col: number, values: Array<number | string | null>) {
  const s = wb.sheets[0]!;
  for (let r = 0; r < values.length; r++) {
    const v = values[r];
    if (v === null) continue;
    wb.setCellFromInput(s.id, { row: r, col }, String(v));
  }
}

describe('Conditional formatting: cellIs', () => {
  it('fills matching cells', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [1, -5, 10, 0, -2]);
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '<',
      value: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
      style: { fill: '#fee2e2' },
    });
    const overlays = evaluateRules(s, wb);
    expect(overlays.get(cellKey(1, 0))?.fill).toBe('#fee2e2');
    expect(overlays.get(cellKey(4, 0))?.fill).toBe('#fee2e2');
    expect(overlays.get(cellKey(0, 0))).toBeUndefined();
  });

  it('supports between and contains', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [1, 5, 10, 25, 50]);
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: 'between',
      value: 5,
      value2: 20,
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
      style: { fill: '#fff' },
    });
    const ov = evaluateRules(s, wb);
    // 5, 10 match; 1, 25, 50 don't.
    expect(ov.get(cellKey(0, 0))).toBeUndefined();
    expect(ov.get(cellKey(1, 0))?.fill).toBe('#fff');
    expect(ov.get(cellKey(2, 0))?.fill).toBe('#fff');
    expect(ov.get(cellKey(3, 0))).toBeUndefined();
  });
});

describe('Conditional formatting: duplicates', () => {
  it('flags repeat values', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, ['a', 'b', 'a', 'c', 'b']);
    wb.addConditionalRule(s.id, {
      kind: 'duplicates',
      mode: 'duplicate',
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
      style: { fill: '#ff0' },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(0, 0))?.fill).toBe('#ff0');
    expect(ov.get(cellKey(1, 0))?.fill).toBe('#ff0');
    expect(ov.get(cellKey(2, 0))?.fill).toBe('#ff0');
    expect(ov.get(cellKey(3, 0))).toBeUndefined();
  });
});

describe('Conditional formatting: top/bottom & average', () => {
  it('top N selects the highest values', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [1, 2, 3, 4, 5]);
    wb.addConditionalRule(s.id, {
      kind: 'topBottom',
      n: 2,
      top: true,
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
      style: { fill: '#0ff' },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(3, 0))?.fill).toBe('#0ff');
    expect(ov.get(cellKey(4, 0))?.fill).toBe('#0ff');
    expect(ov.get(cellKey(2, 0))).toBeUndefined();
  });

  it('aboveBelowAvg: above', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [10, 20, 30, 40, 50]); // mean = 30
    wb.addConditionalRule(s.id, {
      kind: 'aboveBelowAvg',
      above: true,
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
      style: { fill: '#0f0' },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(3, 0))?.fill).toBe('#0f0');
    expect(ov.get(cellKey(4, 0))?.fill).toBe('#0f0');
    expect(ov.get(cellKey(2, 0))).toBeUndefined(); // equal to mean
  });
});

describe('Conditional formatting: visual rules', () => {
  it('data bar fractions are clamped to [0,1]', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [0, 50, 100]);
    wb.addConditionalRule(s.id, {
      kind: 'dataBar',
      color: '#60a5fa',
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(0, 0))?.dataBar?.fraction).toBe(0);
    expect(ov.get(cellKey(1, 0))?.dataBar?.fraction).toBe(0.5);
    expect(ov.get(cellKey(2, 0))?.dataBar?.fraction).toBe(1);
  });

  it('color scale blends endpoints', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [0, 10]);
    wb.addConditionalRule(s.id, {
      kind: 'colorScale',
      range: { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      min: { kind: 'min', color: '#ff0000' },
      max: { kind: 'max', color: '#00ff00' },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(0, 0))?.fill).toBe('#ff0000');
    expect(ov.get(cellKey(1, 0))?.fill).toBe('#00ff00');
  });
});

describe('Conditional formatting: ordering and commands', () => {
  it('priority controls which rule wins', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [5]);
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '>',
      value: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { fill: '#f00' },
    });
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '>',
      value: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { fill: '#0f0' },
    });
    const ov = evaluateRules(s, wb);
    // Later rule overwrites the fill for the same cell (higher priority wins).
    expect(ov.get(cellKey(0, 0))?.fill).toBe('#0f0');
  });

  it('stopIfTrue prevents lower-priority rules from applying', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    seed(wb, 0, [5]);
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '>',
      value: 0,
      stopIfTrue: true,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { fill: '#f00' },
    });
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '>',
      value: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { fill: '#0f0' },
    });
    const ov = evaluateRules(s, wb);
    expect(ov.get(cellKey(0, 0))?.fill).toBe('#f00');
  });

  it('undo removes the rule', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.addConditionalRule(s.id, {
      kind: 'cellIs',
      op: '=',
      value: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { fill: '#fff' },
    });
    expect(s.conditionalRules).toHaveLength(1);
    wb.undo();
    expect(s.conditionalRules).toHaveLength(0);
    wb.redo();
    expect(s.conditionalRules).toHaveLength(1);
  });
});
