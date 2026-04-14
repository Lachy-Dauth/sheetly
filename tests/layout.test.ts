import { describe, expect, it } from 'vitest';
import { Sheet } from '../src/engine/sheet';
import { colAt, rowAt, columnX, rowY, totalHeight, totalWidth } from '../src/grid/layout';

describe('grid layout', () => {
  it('finds the column containing a pixel position', () => {
    const s = new Sheet('S');
    // Default width is 96.
    expect(colAt(s, 0).col).toBe(0);
    expect(colAt(s, 95).col).toBe(0);
    expect(colAt(s, 96).col).toBe(1);
    expect(colAt(s, 96 * 3 + 1).col).toBe(3);
  });

  it('honours custom column widths', () => {
    const s = new Sheet('S');
    s.setColWidth(0, 50);
    s.setColWidth(1, 200);
    expect(colAt(s, 49).col).toBe(0);
    expect(colAt(s, 50).col).toBe(1);
    expect(colAt(s, 249).col).toBe(1);
    expect(colAt(s, 250).col).toBe(2);
  });

  it('finds the row containing a pixel position', () => {
    const s = new Sheet('S');
    expect(rowAt(s, 0).row).toBe(0);
    expect(rowAt(s, 21).row).toBe(0);
    expect(rowAt(s, 22).row).toBe(1);
  });

  it('reports total width / height', () => {
    const s = new Sheet('S');
    s.colCount = 3;
    s.rowCount = 2;
    expect(totalWidth(s)).toBe(96 * 3);
    expect(totalHeight(s)).toBe(22 * 2);
  });

  it('computes column X / row Y', () => {
    const s = new Sheet('S');
    expect(columnX(s, 0)).toBe(0);
    expect(columnX(s, 2)).toBe(192);
    expect(rowY(s, 0)).toBe(0);
    expect(rowY(s, 2)).toBe(44);
  });
});
