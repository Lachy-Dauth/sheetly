import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { computeSparkline, renderSparklineSvg } from '../src/charts/sparkline';
import { resolveNumericRange } from '../src/charts/data';

describe('Sparklines', () => {
  it('line layout maps values onto the canvas box', () => {
    const layout = computeSparkline({ type: 'line', range: 'A1:A3' }, [0, 5, 10], 60, 20);
    expect(layout.line).toHaveLength(3);
    expect(layout.line[0]!.y).toBeGreaterThan(layout.line[2]!.y); // y grows downward
    // The first and last x points sit inside the padded box
    expect(layout.line[0]!.x).toBeGreaterThanOrEqual(0);
    expect(layout.line[2]!.x).toBeLessThanOrEqual(60);
  });

  it('column layout splits values into positive and negative bars', () => {
    const layout = computeSparkline({ type: 'column', range: 'A1:A3' }, [3, -2, 5], 60, 20);
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars[0]!.positive).toBe(true);
    expect(layout.bars[1]!.positive).toBe(false);
    expect(layout.bars[2]!.positive).toBe(true);
  });

  it('win/loss layout treats magnitude uniformly', () => {
    const layout = computeSparkline({ type: 'winloss', range: 'A1:A4' }, [1, -100, 0, 5], 80, 20);
    expect(layout.bars).toHaveLength(4);
    expect(layout.bars[2]!.zero).toBe(true);
    const wins = layout.bars.filter((b) => b.positive && !b.zero);
    const losses = layout.bars.filter((b) => !b.positive);
    expect(wins).toHaveLength(2);
    expect(losses).toHaveLength(1);
  });

  it('renders to SVG markup', () => {
    const svg = renderSparklineSvg({ type: 'line', range: 'A1:A3', color: '#123456' }, [1, 2, 3]);
    expect(svg).toMatch(/^<svg[^>]*>/);
    expect(svg).toContain('#123456');
    expect(svg).toContain('<path');
  });

  it('setSparkline stores on the cell and is undoable', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    for (let i = 0; i < 4; i++) {
      w.setCellFromInput(sid, { row: i, col: 0 }, String(i * 2));
    }
    w.setSparkline(sid, { row: 0, col: 2 }, { type: 'line', range: 'A1:A4' });
    expect(w.sheets[0]!.getCell({ row: 0, col: 2 })?.sparkline?.type).toBe('line');
    w.undo();
    expect(w.sheets[0]!.getCell({ row: 0, col: 2 })?.sparkline).toBeUndefined();
  });

  it('resolveNumericRange pulls numeric values from the cached cell state', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    [1, 2, 'oops', 4].forEach((v, i) =>
      w.setCellFromInput(sid, { row: i, col: 0 }, String(v)),
    );
    const nums = resolveNumericRange(w, sid, 'A1:A4');
    expect(nums).toEqual([1, 2, 4]);
  });
});
