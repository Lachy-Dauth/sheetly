import { describe, expect, it } from 'vitest';
import { formatValue } from '../src/grid/format';
import { dateToSerial } from '../src/engine/parse-input';

describe('number format', () => {
  it('formats whole and fractional numbers with General', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(3.14159)).toBe('3.14159');
  });

  it('honours fixed precision', () => {
    expect(formatValue(3.14159, '0.00')).toBe('3.14');
    expect(formatValue(1000, '#,##0')).toBe('1,000');
    expect(formatValue(1000, '#,##0.00')).toBe('1,000.00');
  });

  it('formats percents', () => {
    expect(formatValue(0.125, '0%')).toBe('13%');
    expect(formatValue(0.125, '0.00%')).toBe('12.50%');
  });

  it('formats booleans and errors literally', () => {
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue({ kind: 'error', code: '#DIV/0!' })).toBe('#DIV/0!');
  });

  it('returns empty for blank', () => {
    expect(formatValue(null)).toBe('');
  });

  it('applies date formatting tokens', () => {
    // Excel serial 44927 -> 2023-01-01 ish (approximate).
    const out = formatValue(44927, 'yyyy-mm-dd');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('distinguishes month vs minute in date/time formats', () => {
    // Time-only format: an `mm` between `h` and `s` must render minutes, not month.
    // 0.5625 of a day = 13:30:00. A month-interpretation would produce "13:01".
    expect(formatValue(0.5625, 'hh:mm:ss')).toBe('13:30:00');
    expect(formatValue(0.5625, 'hh:mm')).toBe('13:30');
    // Mixed date+time: the first `mm` after `yyyy-` is month, the second after `hh:` is minutes.
    const serial = dateToSerial(2023, 6, 15) + 0.5; // 2023-06-15 12:00
    expect(formatValue(serial, 'yyyy-mm-dd hh:mm')).toBe('2023-06-15 12:00');
  });
});
