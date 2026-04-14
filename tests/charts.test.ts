import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { niceTicks, linearScale, valueExtent, stackExtent } from '../src/charts/scales';
import { fitTrendline } from '../src/charts/trendline';
import { resolveChartData } from '../src/charts/data';
import { renderChartSvg } from '../src/charts/render';

function seed(): { w: Workbook; sid: string } {
  const w = Workbook.createDefault();
  const sid = w.sheets[0]!.id;
  // Header row + 4 data rows over 3 columns: category + 2 series.
  const rows: Array<[string, number, number]> = [
    ['Q1', 10, 5],
    ['Q2', 12, 7],
    ['Q3', 8, 11],
    ['Q4', 15, 9],
  ];
  w.setCellFromInput(sid, { row: 0, col: 0 }, 'Quarter');
  w.setCellFromInput(sid, { row: 0, col: 1 }, 'Revenue');
  w.setCellFromInput(sid, { row: 0, col: 2 }, 'Profit');
  rows.forEach(([q, r, p], i) => {
    w.setCellFromInput(sid, { row: i + 1, col: 0 }, q);
    w.setCellFromInput(sid, { row: i + 1, col: 1 }, String(r));
    w.setCellFromInput(sid, { row: i + 1, col: 2 }, String(p));
  });
  return { w, sid };
}

describe('chart scales', () => {
  it('niceTicks produces a monotonically increasing list spanning the domain', () => {
    const ticks = niceTicks(0, 97, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(97);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('linearScale maps the domain to the pixel range', () => {
    const s = linearScale(0, 100, 0, 200);
    expect(Math.round(s(0))).toBe(0);
    expect(Math.round(s(100))).toBe(200);
    expect(Math.round(s(50))).toBe(100);
  });

  it('valueExtent ignores nulls and infinities', () => {
    const e = valueExtent([
      [1, null, 3],
      [null, 7, -2],
    ]);
    expect(e).toEqual({ min: -2, max: 7 });
  });

  it('stackExtent sums positives and negatives separately', () => {
    const e = stackExtent([
      [1, 2, 3],
      [2, 3, 4],
    ]);
    expect(e).toEqual({ min: 0, max: 7 });
  });
});

describe('trendline fitting', () => {
  it('recovers a linear slope', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, 3, 5, 7, 9];
    const fit = fitTrendline(xs, ys, 'linear');
    expect(fit).not.toBeNull();
    expect(fit!.coeffs[0]).toBeCloseTo(1, 6);
    expect(fit!.coeffs[1]).toBeCloseTo(2, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
    expect(fit!.predict(10)).toBeCloseTo(21, 6);
  });

  it('fits an exponential curve (y = 2 · e^x)', () => {
    const xs = [0, 1, 2, 3];
    const ys = xs.map((x) => 2 * Math.exp(x));
    const fit = fitTrendline(xs, ys, 'exp');
    expect(fit).not.toBeNull();
    expect(fit!.coeffs[0]).toBeCloseTo(2, 6);
    expect(fit!.coeffs[1]).toBeCloseTo(1, 6);
  });

  it('fits a quadratic', () => {
    const xs = [-2, -1, 0, 1, 2];
    const ys = xs.map((x) => 3 + 2 * x + x * x);
    const fit = fitTrendline(xs, ys, 'poly2');
    expect(fit).not.toBeNull();
    expect(fit!.coeffs[0]).toBeCloseTo(3, 6);
    expect(fit!.coeffs[1]).toBeCloseTo(2, 6);
    expect(fit!.coeffs[2]).toBeCloseTo(1, 6);
  });
});

describe('chart data resolution', () => {
  it('splits headers, categories, and series', () => {
    const { w, sid } = seed();
    const chart = w.addChart(sid, 'column', {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 2 },
    });
    const data = resolveChartData(w, chart);
    expect(data.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(data.series.map((s) => s.name)).toEqual(['Revenue', 'Profit']);
    expect(data.series[0]!.values).toEqual([10, 12, 8, 15]);
    expect(data.series[1]!.values).toEqual([5, 7, 11, 9]);
  });

  it('handles no-header no-category ranges', () => {
    const { w, sid } = seed();
    const chart = w.addChart(sid, 'line', {
      start: { row: 1, col: 1 },
      end: { row: 4, col: 2 },
    }, { hasHeaderRow: false, hasCategoryColumn: false });
    const data = resolveChartData(w, chart);
    expect(data.categories).toEqual(['1', '2', '3', '4']);
    expect(data.series).toHaveLength(2);
    expect(data.series[0]!.values).toEqual([10, 12, 8, 15]);
  });
});

describe('chart rendering', () => {
  it('emits SVG with <rect> bars for column charts', () => {
    const { w, sid } = seed();
    const chart = w.addChart(sid, 'column', {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 2 },
    });
    const svg = renderChartSvg(chart, w, { width: 400, height: 240 });
    expect(svg).toMatch(/^<svg[^>]*>/);
    expect(svg).toMatch(/<rect[^>]+data-series="Revenue"/);
    expect(svg).toMatch(/<rect[^>]+data-series="Profit"/);
    expect(svg.match(/<rect[^>]+data-series=/g)!.length).toBe(8);
  });

  it('emits a <path> per data series for line charts', () => {
    const { w, sid } = seed();
    const chart = w.addChart(sid, 'line', {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 2 },
    });
    const svg = renderChartSvg(chart, w);
    expect(svg.match(/<path\b/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('pie charts render one slice per category', () => {
    const { w, sid } = seed();
    const chart = w.addChart(sid, 'pie', {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 1 },
    });
    const svg = renderChartSvg(chart, w);
    expect(svg.match(/<path\b/g)!.length).toBe(4);
  });
});

describe('chart lifecycle', () => {
  it('undo removes the chart', () => {
    const { w, sid } = seed();
    w.addChart(sid, 'column', { start: { row: 0, col: 0 }, end: { row: 4, col: 2 } });
    expect(w.getSheet(sid).charts).toHaveLength(1);
    w.undo();
    expect(w.getSheet(sid).charts).toHaveLength(0);
    w.redo();
    expect(w.getSheet(sid).charts).toHaveLength(1);
  });

  it('updateChart mutates config and is reversible', () => {
    const { w, sid } = seed();
    const c = w.addChart(sid, 'column', {
      start: { row: 0, col: 0 },
      end: { row: 4, col: 2 },
    });
    w.updateChart(c.id, { type: 'bar' });
    expect(w.getSheet(sid).charts[0]!.type).toBe('bar');
    w.undo();
    expect(w.getSheet(sid).charts[0]!.type).toBe('column');
  });
});
