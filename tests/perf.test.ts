import { describe, expect, it, beforeEach } from 'vitest';
import {
  getProfile,
  isProfilingEnabled,
  recordEval,
  recordFormat,
  recordParse,
  recordRecalc,
  resetProfile,
  setProfilingEnabled,
} from '../src/engine/profile';
import { clearParseCache, parseFormula } from '../src/engine/formula/parse';
import { clearFormatCache, formatValue } from '../src/grid/format';
import { Workbook } from '../src/engine/workbook';

describe('profile counters', () => {
  beforeEach(() => {
    setProfilingEnabled(false);
    resetProfile();
  });

  it('is disabled by default so production calls are free', () => {
    expect(isProfilingEnabled()).toBe(false);
    recordParse(false);
    recordFormat(true);
    recordEval();
    recordRecalc();
    const snap = getProfile();
    expect(snap.parseMiss).toBe(0);
    expect(snap.formatHit).toBe(0);
    expect(snap.evalCalls).toBe(0);
    expect(snap.recalcCalls).toBe(0);
  });

  it('records events only while enabled', () => {
    setProfilingEnabled(true);
    recordParse(false);
    recordParse(true);
    recordFormat(false);
    recordFormat(true);
    recordFormat(true);
    recordEval();
    recordRecalc();
    const snap = getProfile();
    expect(snap.parseMiss).toBe(1);
    expect(snap.parseHit).toBe(1);
    expect(snap.formatMiss).toBe(1);
    expect(snap.formatHit).toBe(2);
    expect(snap.evalCalls).toBe(1);
    expect(snap.recalcCalls).toBe(1);
    setProfilingEnabled(false);
  });

  it('resetProfile clears all counters', () => {
    setProfilingEnabled(true);
    recordParse(true);
    recordEval();
    resetProfile();
    expect(getProfile()).toEqual({
      parseMiss: 0,
      parseHit: 0,
      formatMiss: 0,
      formatHit: 0,
      evalCalls: 0,
      recalcCalls: 0,
    });
    setProfilingEnabled(false);
  });
});

describe('parse cache', () => {
  beforeEach(() => {
    clearParseCache();
    resetProfile();
    setProfilingEnabled(true);
  });

  it('returns the same result for identical sources and records hits', () => {
    const a = parseFormula('A1+B1*2');
    const b = parseFormula('A1+B1*2');
    expect(a).toBe(b);
    const snap = getProfile();
    expect(snap.parseMiss).toBe(1);
    expect(snap.parseHit).toBe(1);
    setProfilingEnabled(false);
  });

  it('caches parse failures just as happily as successes', () => {
    parseFormula('((');
    parseFormula('((');
    const snap = getProfile();
    expect(snap.parseMiss).toBe(1);
    expect(snap.parseHit).toBe(1);
    setProfilingEnabled(false);
  });
});

describe('format cache', () => {
  beforeEach(() => {
    clearFormatCache();
    resetProfile();
    setProfilingEnabled(true);
  });

  it('caches number-format results for repeated calls', () => {
    const r1 = formatValue(1234.5, '#,##0.00');
    const r2 = formatValue(1234.5, '#,##0.00');
    expect(r1).toBe('1,234.50');
    expect(r2).toBe(r1);
    const snap = getProfile();
    expect(snap.formatMiss).toBe(1);
    expect(snap.formatHit).toBe(1);
    setProfilingEnabled(false);
  });

  it('keys on value and format so different formats are not confused', () => {
    formatValue(0.25, 'General');
    formatValue(0.25, '0.00%');
    formatValue(0.25, 'General');
    const snap = getProfile();
    expect(snap.formatMiss).toBe(2);
    expect(snap.formatHit).toBe(1);
    setProfilingEnabled(false);
  });

  it('skips caching strings, so they fall through every time', () => {
    formatValue('hello', 'General');
    formatValue('hello', 'General');
    const snap = getProfile();
    expect(snap.formatHit).toBe(0);
    expect(snap.formatMiss).toBe(0);
    setProfilingEnabled(false);
  });
});

describe('incremental recalc', () => {
  beforeEach(() => {
    resetProfile();
    setProfilingEnabled(true);
  });

  it('only re-evaluates cells downstream of the change', () => {
    const wb = Workbook.createDefault();
    const sid = wb.sheets[0]!.id;
    wb.setCellFromInput(sid, { row: 0, col: 0 }, '1');
    wb.setCellFromInput(sid, { row: 1, col: 0 }, '2');
    wb.setCellFromInput(sid, { row: 2, col: 0 }, '3');
    wb.setCellFromInput(sid, { row: 0, col: 1 }, '=A1*10');
    wb.setCellFromInput(sid, { row: 1, col: 1 }, '=A2*10');
    wb.setCellFromInput(sid, { row: 2, col: 1 }, '=A3*10');
    wb.setCellFromInput(sid, { row: 0, col: 2 }, '=B1+B2+B3');

    resetProfile();
    // Change only A2 — should re-evaluate B2 and C1, not B1 or B3.
    wb.setCellFromInput(sid, { row: 1, col: 0 }, '20');
    const snap = getProfile();
    // Evals: B2 (A2 changed), C1 (depends on B2).
    expect(snap.evalCalls).toBe(2);
    expect(snap.recalcCalls).toBeGreaterThanOrEqual(1);
    setProfilingEnabled(false);
  });

  it('does nothing when no cell is dirty', () => {
    const wb = Workbook.createDefault();
    const sid = wb.sheets[0]!.id;
    wb.setCellFromInput(sid, { row: 0, col: 0 }, '=1+1');
    resetProfile();
    wb.runtime.recalc();
    const snap = getProfile();
    expect(snap.recalcCalls).toBe(0);
    expect(snap.evalCalls).toBe(0);
    setProfilingEnabled(false);
  });
});
