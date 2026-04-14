import { describe, expect, it } from 'vitest';
import { StyleTable } from '../src/engine/styles';
import { Workbook } from '../src/engine/workbook';

describe('StyleTable', () => {
  it('dedupes equal styles', () => {
    const t = new StyleTable();
    const a = t.intern({ bold: true, color: '#000' });
    const b = t.intern({ color: '#000', bold: true });
    expect(a).toBe(b);
  });

  it('returns distinct ids for different styles', () => {
    const t = new StyleTable();
    expect(t.intern({ bold: true })).not.toBe(t.intern({ bold: false }));
  });

  it('ignores undefined props when hashing', () => {
    const t = new StyleTable();
    expect(t.intern({ bold: true, color: undefined })).toBe(t.intern({ bold: true }));
  });

  it('index 0 is the empty style', () => {
    const t = new StyleTable();
    expect(t.get(0)).toEqual({});
  });
});

describe('Workbook style application', () => {
  it('attaches style to a range and survives setCell', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setStyle(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
      { bold: true },
    );
    expect(wb.styles.get(s.getCell({ row: 0, col: 0 })!.styleId!).bold).toBe(true);
    expect(wb.styles.get(s.getCell({ row: 0, col: 1 })!.styleId!).bold).toBe(true);
  });

  it('preserves style-only cells across undo/redo', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setStyle(s.id, { start: { row: 2, col: 2 }, end: { row: 2, col: 2 } }, { italic: true });
    expect(s.getCell({ row: 2, col: 2 })?.styleId).toBeDefined();
    wb.undo();
    expect(s.getCell({ row: 2, col: 2 })).toBeUndefined();
    wb.redo();
    expect(s.getCell({ row: 2, col: 2 })?.styleId).toBeDefined();
  });

  it('merging and unmerging a range works via helper', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.mergeRange(s.id, { start: { row: 0, col: 0 }, end: { row: 1, col: 2 } });
    expect(s.merges).toHaveLength(1);
    wb.unmergeAt(s.id, { row: 0, col: 1 });
    expect(s.merges).toHaveLength(0);
  });

  it('merging over an existing merge replaces it', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.mergeRange(s.id, { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } });
    wb.mergeRange(s.id, { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
    expect(s.merges).toHaveLength(1);
    expect(s.merges[0]!.range.end).toEqual({ row: 2, col: 2 });
  });
});
