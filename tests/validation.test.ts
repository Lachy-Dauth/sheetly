import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { validateCellInput } from '../src/engine/validation';

function wb() {
  const w = Workbook.createDefault();
  return { w, s: w.sheets[0]! };
}

describe('Validation', () => {
  it('number range rejects out-of-bounds values', () => {
    const { w, s } = wb();
    w.addValidation(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { kind: 'numberRange', min: 0, max: 10 },
    );
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 5).ok).toBe(true);
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 15).ok).toBe(false);
    expect(validateCellInput(w, s, { row: 0, col: 0 }, -1).ok).toBe(false);
  });

  it('list rule accepts only whitelisted values when strict', () => {
    const { w, s } = wb();
    w.addValidation(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { kind: 'list', values: ['red', 'green', 'blue'], strict: true },
    );
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 'red').ok).toBe(true);
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 'yellow').ok).toBe(false);
  });

  it('textLength checks min/max', () => {
    const { w, s } = wb();
    w.addValidation(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { kind: 'textLength', min: 2, max: 5 },
    );
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 'abc').ok).toBe(true);
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 'a').ok).toBe(false);
    expect(validateCellInput(w, s, { row: 0, col: 0 }, 'abcdef').ok).toBe(false);
  });

  it('setCellFromInput rejects invalid values', () => {
    const { w, s } = wb();
    w.addValidation(
      s.id,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { kind: 'numberRange', min: 0, max: 10 },
      'Please enter 0..10',
    );
    const bad = w.setCellFromInput(s.id, { row: 0, col: 0 }, '99');
    expect(bad.ok).toBe(false);
    expect(bad.message).toBe('Please enter 0..10');
    expect(s.getCell({ row: 0, col: 0 })).toBeUndefined();
    const good = w.setCellFromInput(s.id, { row: 0, col: 0 }, '5');
    expect(good.ok).toBe(true);
    expect(s.getCell({ row: 0, col: 0 })?.value).toBe(5);
  });

  it('undo removes the validation rule', () => {
    const { w, s } = wb();
    w.addValidation(s.id, { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, {
      kind: 'numberRange',
      min: 0,
    });
    expect(s.validations).toHaveLength(1);
    w.undo();
    expect(s.validations).toHaveLength(0);
  });
});
