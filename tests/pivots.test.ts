import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { buildPivotCache, groupKey } from '../src/engine/pivot-cache';
import { computePivotLayout, drillDown } from '../src/engine/pivot-layout';
import { createAggregator } from '../src/engine/pivot-aggregate';
import type { Pivot, PivotField, PivotValueField } from '../src/engine/pivots';

function seedSales(): { w: Workbook; sid: string } {
  const w = Workbook.createDefault();
  const sid = w.sheets[0]!.id;
  // Region | Product | Units | Revenue
  const rows = [
    ['East', 'Apple', 3, 30],
    ['East', 'Apple', 2, 20],
    ['East', 'Banana', 5, 40],
    ['West', 'Apple', 4, 40],
    ['West', 'Banana', 1, 8],
    ['West', 'Banana', 6, 48],
  ];
  w.setCellFromInput(sid, { row: 0, col: 0 }, 'Region');
  w.setCellFromInput(sid, { row: 0, col: 1 }, 'Product');
  w.setCellFromInput(sid, { row: 0, col: 2 }, 'Units');
  w.setCellFromInput(sid, { row: 0, col: 3 }, 'Revenue');
  rows.forEach((r, i) => {
    w.setCellFromInput(sid, { row: i + 1, col: 0 }, String(r[0]));
    w.setCellFromInput(sid, { row: i + 1, col: 1 }, String(r[1]));
    w.setCellFromInput(sid, { row: i + 1, col: 2 }, String(r[2]));
    w.setCellFromInput(sid, { row: i + 1, col: 3 }, String(r[3]));
  });
  return { w, sid };
}

function addPivotBasic(
  w: Workbook,
  sid: string,
  opts: {
    rows?: PivotField[];
    cols?: PivotField[];
    values?: PivotValueField[];
    output?: { row: number; col: number };
  } = {},
): Pivot {
  return w.addPivot({
    sheetId: sid,
    output: opts.output ?? { row: 0, col: 6 },
    source: {
      sheetId: sid,
      range: { start: { row: 0, col: 0 }, end: { row: 6, col: 3 } },
      hasHeader: true,
    },
    rows: opts.rows,
    cols: opts.cols,
    values: opts.values,
  });
}

describe('pivot cache', () => {
  it('snapshots a range into typed rows with headers', () => {
    const { w, sid } = seedSales();
    const cache = buildPivotCache(w, {
      sheetId: sid,
      range: { start: { row: 0, col: 0 }, end: { row: 6, col: 3 } },
      hasHeader: true,
    });
    expect(cache.headers).toEqual(['Region', 'Product', 'Units', 'Revenue']);
    expect(cache.rows).toHaveLength(6);
    expect(cache.rows[0]!.values).toEqual(['East', 'Apple', 3, 30]);
  });

  it('groups dates by month', () => {
    const field: PivotField = { sourceColumn: 0, grouping: { kind: 'date', unit: 'month' } };
    const g = groupKey(field, '2024-03-17');
    expect(g.key).toBe('2024-03');
    expect(g.label).toContain('2024');
  });

  it('groups numbers into bins', () => {
    const field: PivotField = { sourceColumn: 0, grouping: { kind: 'numberRange', step: 10 } };
    expect(groupKey(field, 0).key).toBe('0–10');
    expect(groupKey(field, 23).key).toBe('20–30');
    expect(groupKey(field, 55).key).toBe('50–60');
  });
});

describe('aggregators', () => {
  it('sum ignores nulls', () => {
    const a = createAggregator('sum');
    [1, null, 2, '3', ''].forEach((v) => a.add(v as never));
    expect(a.result()).toBe(6);
  });

  it('avg returns null on empty input', () => {
    const a = createAggregator('avg');
    expect(a.result()).toBeNull();
    a.add(10);
    a.add(20);
    expect(a.result()).toBe(15);
  });

  it('stdev uses Welford', () => {
    const a = createAggregator('stdev');
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => a.add(v));
    // Sample stdev of this sequence is ~2.138
    const r = a.result()!;
    expect(r).toBeCloseTo(2.138, 2);
  });

  it('distinctCount counts unique values case-insensitively for strings', () => {
    const a = createAggregator('distinctCount');
    ['a', 'A', 'b', 'b', null, ''].forEach((v) => a.add(v as never));
    expect(a.result()).toBe(2);
  });
});

describe('pivot layout', () => {
  it('computes a Region x Product matrix of sum(Revenue)', () => {
    const { w, sid } = seedSales();
    const pivot = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      cols: [{ sourceColumn: 1 }],
      values: [{ sourceColumn: 3, agg: 'sum' }],
    });
    const cache = buildPivotCache(w, pivot.source);
    const out = computePivotLayout(pivot, cache);
    // Find the East row and Apple column in the body
    const labels = out.matrix.map((row) => row.map((c) => (c == null ? '' : String(c))));
    // Row header contains 'Region' at (0, 0)
    expect(labels[0]![0]).toBe('Region');
    // Find an 'East' row
    const eastRow = labels.findIndex((r) => r[0] === 'East');
    expect(eastRow).toBeGreaterThan(0);
    // Apple column
    const appleCol = labels[0]!.indexOf('Apple');
    expect(appleCol).toBeGreaterThan(0);
    expect(labels[eastRow]![appleCol]).toBe('50'); // 30 + 20
  });

  it('includes grand totals by default', () => {
    const { w, sid } = seedSales();
    const pivot = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [{ sourceColumn: 2, agg: 'sum' }],
    });
    const cache = buildPivotCache(w, pivot.source);
    const out = computePivotLayout(pivot, cache);
    const rows = out.matrix.map((r) => r.map((c) => (c == null ? '' : String(c))));
    const grand = rows.findIndex((r) => r[0] === 'Grand Total');
    expect(grand).toBeGreaterThan(0);
    // Sum of Units = 3+2+5+4+1+6 = 21
    expect(rows[grand]!.slice(1).find((v) => v === '21')).toBeDefined();
  });

  it('supports drill-down provenance', () => {
    const { w, sid } = seedSales();
    const pivot = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      cols: [{ sourceColumn: 1 }],
      values: [{ sourceColumn: 3, agg: 'sum' }],
    });
    const cache = buildPivotCache(w, pivot.source);
    const out = computePivotLayout(pivot, cache);
    // East x Apple — 2 source rows
    const labels = out.matrix.map((r) => r.map((c) => (c == null ? '' : String(c))));
    const eastRow = labels.findIndex((r) => r[0] === 'East');
    const appleCol = labels[0]!.indexOf('Apple');
    const src = drillDown(out, eastRow, appleCol);
    expect(src).toHaveLength(2);
    expect(src.every((row) => row.values[0] === 'East' && row.values[1] === 'Apple')).toBe(true);
  });

  it('uses numberRange grouping on a row field', () => {
    const { w, sid } = seedSales();
    const pivot = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 2, grouping: { kind: 'numberRange', step: 3 } }],
      values: [{ sourceColumn: 3, agg: 'sum' }],
    });
    const cache = buildPivotCache(w, pivot.source);
    const out = computePivotLayout(pivot, cache);
    const rows = out.matrix.map((r) => r.map((c) => (c == null ? '' : String(c))));
    // Expect at least one '0–3' or '3–6' or '6–9' bucket label
    expect(rows.some((r) => /\d+–\d+/.test(r[0] ?? ''))).toBe(true);
  });

  it('supports multiple aggregates on the same value column', () => {
    const { w, sid } = seedSales();
    const pivot = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [
        { sourceColumn: 3, agg: 'sum' },
        { sourceColumn: 3, agg: 'avg' },
      ],
    });
    const cache = buildPivotCache(w, pivot.source);
    const out = computePivotLayout(pivot, cache);
    expect(out.valueHeaders).toHaveLength(2);
    expect(out.matrix[0]!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('workbook integration', () => {
  it('addPivot / removePivot round-trip undoes', () => {
    const { w, sid } = seedSales();
    const p = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [{ sourceColumn: 2, agg: 'sum' }],
    });
    expect(w.pivots.listForSheet(sid)).toHaveLength(1);
    w.undo();
    expect(w.pivots.get(p.id)).toBeUndefined();
    w.redo();
    expect(w.pivots.get(p.id)).toBeDefined();
  });

  it('refreshPivot writes matrix cells into the destination', () => {
    const { w, sid } = seedSales();
    const p = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [{ sourceColumn: 2, agg: 'sum' }],
      output: { row: 10, col: 0 },
    });
    w.refreshPivot(p.id);
    const sheet = w.getSheet(sid);
    // Grand Total somewhere in column 0 under the output anchor
    let found = false;
    for (let r = 10; r < 20; r++) {
      const cell = sheet.getCell({ row: r, col: 0 });
      if (cell?.value === 'Grand Total') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('updatePivot changes a pivot in place', () => {
    const { w, sid } = seedSales();
    const p = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [{ sourceColumn: 2, agg: 'sum' }],
    });
    w.updatePivot(p.id, { name: 'Renamed' });
    expect(w.pivots.get(p.id)!.name).toBe('Renamed');
    w.undo();
    expect(w.pivots.get(p.id)!.name).not.toBe('Renamed');
  });

  it('default pivot name matches its id suffix', () => {
    // Previously: `Pivot${nextId}` was off-by-one because nextId++ ran first.
    const { w, sid } = seedSales();
    const p = addPivotBasic(w, sid, {
      rows: [{ sourceColumn: 0 }],
      values: [{ sourceColumn: 2, agg: 'sum' }],
    });
    const idNum = p.id.replace(/^p/, '');
    expect(p.name).toBe(`Pivot${idNum}`);
  });
});

describe('pivot grouping safety', () => {
  it('numberRange with step=0 falls back to ungrouped key', () => {
    const field: PivotField = { sourceColumn: 0, grouping: { kind: 'numberRange', step: 0 } };
    const g = groupKey(field, 42);
    expect(Number.isFinite(g.sort as number)).toBe(true);
    expect(g.label).not.toContain('NaN');
    expect(g.label).not.toContain('Infinity');
  });
});
