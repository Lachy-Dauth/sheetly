import { describe, expect, it } from 'vitest';
import { Sheet } from '../src/engine/sheet';

describe('Sheet sparse map', () => {
  it('stores and retrieves cells', () => {
    const s = new Sheet('S');
    s.setCell({ row: 100, col: 50 }, { raw: 'x', value: 'x' });
    expect(s.getCell({ row: 100, col: 50 })?.raw).toBe('x');
    expect(s.maxRow).toBe(100);
    expect(s.maxCol).toBe(50);
  });

  it('deletes blank cells', () => {
    const s = new Sheet('S');
    s.setCell({ row: 0, col: 0 }, { raw: 'x', value: 'x' });
    s.setCell({ row: 0, col: 0 }, { raw: null });
    expect(s.getCell({ row: 0, col: 0 })).toBeUndefined();
  });

  it('tracks column and row dimensions', () => {
    const s = new Sheet('S');
    s.setColWidth(5, 120);
    s.setRowHeight(10, 30);
    expect(s.colWidth(5)).toBe(120);
    expect(s.rowHeight(10)).toBe(30);
    expect(s.colWidth(0)).toBe(96);
    expect(s.rowHeight(0)).toBe(22);
  });

  it('manages merged ranges', () => {
    const s = new Sheet('S');
    const m = s.addMerge({ start: { row: 0, col: 0 }, end: { row: 1, col: 2 } });
    expect(s.findMergeAt({ row: 1, col: 1 })?.id).toBe(m.id);
    s.removeMerge(m.id);
    expect(s.findMergeAt({ row: 1, col: 1 })).toBeUndefined();
  });
});
