import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';

describe('Workbook', () => {
  it('creates a default sheet', () => {
    const wb = Workbook.createDefault();
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0]!.name).toBe('Sheet1');
  });

  it('set/unset cells reversibly', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, 'hello');
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('hello');
    wb.undo();
    expect(s.getCell({ row: 0, col: 0 })).toBeUndefined();
    wb.redo();
    expect(s.getCell({ row: 0, col: 0 })?.raw).toBe('hello');
  });

  it('parses numbers on input', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setCellFromInput(s.id, { row: 0, col: 0 }, '42');
    expect(s.getCell({ row: 0, col: 0 })?.value).toBe(42);
  });

  it('applies style deltas via the command pattern', () => {
    const wb = Workbook.createDefault();
    const s = wb.sheets[0]!;
    wb.setStyle(s.id, { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, { bold: true });
    const cell = s.getCell({ row: 0, col: 0 });
    expect(cell?.styleId).toBeDefined();
    expect(wb.styles.get(cell!.styleId!)).toMatchObject({ bold: true });
    wb.undo();
    expect(s.getCell({ row: 0, col: 0 })).toBeUndefined();
  });

  it('adds and removes sheets', () => {
    const wb = Workbook.createDefault();
    const s2 = wb.addSheet('Extra');
    expect(wb.sheets).toHaveLength(2);
    expect(s2.name).toBe('Extra');
    wb.undo();
    expect(wb.sheets).toHaveLength(1);
  });
});
