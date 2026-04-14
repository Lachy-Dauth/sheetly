import { describe, expect, it } from 'vitest';
import {
  cycleAbsolute,
  acceptsRefAt,
  findTrailingRef,
  insertOrReplaceRef,
} from '../src/grid/formula-edit';

describe('cycleAbsolute', () => {
  it('cycles A1 through $A$1 → A$1 → $A1 → A1', () => {
    let text = '=A1';
    let caret = 3;
    ({ text, caret } = cycleAbsolute(text, caret));
    expect(text).toBe('=$A$1');
    ({ text, caret } = cycleAbsolute(text, caret));
    expect(text).toBe('=A$1');
    ({ text, caret } = cycleAbsolute(text, caret));
    expect(text).toBe('=$A1');
    ({ text, caret } = cycleAbsolute(text, caret));
    expect(text).toBe('=A1');
  });

  it('cycles the ref the caret is sitting on, not the first one in the formula', () => {
    const text = '=A1+B2';
    // Caret is at end ("=A1+B2|"), should cycle B2.
    const out = cycleAbsolute(text, text.length);
    expect(out.text).toBe('=A1+$B$2');
  });

  it('cycles range refs together', () => {
    const out = cycleAbsolute('=SUM(A1:B2)', 'SUM(A1:B2'.length + 1);
    expect(out.text).toBe('=SUM($A$1:$B$2)');
  });

  it('leaves non-formula text alone', () => {
    const out = cycleAbsolute('hello', 5);
    expect(out.text).toBe('hello');
  });
});

describe('acceptsRefAt', () => {
  it('accepts after =', () => {
    expect(acceptsRefAt('=', 1)).toBe(true);
  });
  it('accepts after operators and commas', () => {
    expect(acceptsRefAt('=A1+', 4)).toBe(true);
    expect(acceptsRefAt('=SUM(A1,', 8)).toBe(true);
    expect(acceptsRefAt('=SUM(', 5)).toBe(true);
  });
  it('accepts when the caret is at the end of a trailing ref', () => {
    expect(acceptsRefAt('=A1', 3)).toBe(true);
    expect(acceptsRefAt('=SUM(A1:B2', 10)).toBe(true);
  });
  it('rejects mid-text', () => {
    expect(acceptsRefAt('=hello', 6)).toBe(false);
    expect(acceptsRefAt('plain text', 5)).toBe(false);
  });
});

describe('findTrailingRef', () => {
  it('returns the span of the trailing ref', () => {
    expect(findTrailingRef('=A1', 3)).toEqual({ start: 1, end: 3 });
    expect(findTrailingRef('=SUM(A1:B2', 10)).toEqual({ start: 5, end: 10 });
  });
  it('returns null for non-ref trailing tokens', () => {
    expect(findTrailingRef('=1+2', 4)).toBeNull();
    expect(findTrailingRef('=A1+', 4)).toBeNull();
  });
});

describe('insertOrReplaceRef', () => {
  it('inserts a fresh ref when the caret is on an operator boundary', () => {
    const out = insertOrReplaceRef('=A1+', 4, 'B5');
    expect(out.text).toBe('=A1+B5');
    expect(out.caret).toBe(6);
  });
  it('replaces the trailing ref instead of appending', () => {
    const out = insertOrReplaceRef('=A1', 3, 'C7');
    expect(out.text).toBe('=C7');
    expect(out.caret).toBe(3);
  });
});
