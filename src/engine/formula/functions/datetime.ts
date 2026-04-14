import { makeError } from '../../cell';
import { dateToSerial, serialToDate } from '../../parse-input';
import { asNumber, asText, iterScalars, register } from '../registry';

export function installDateTime(): void {
  register('TODAY', () => {
    const now = new Date();
    return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
  });

  register('NOW', () => {
    const now = new Date();
    const serial = dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const frac = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    return serial + frac;
  });

  register('DATE', (args) => {
    const y = asNumber(args[0] ?? 1900);
    const m = asNumber(args[1] ?? 1);
    const d = asNumber(args[2] ?? 1);
    if (typeof y !== 'number' || typeof m !== 'number' || typeof d !== 'number')
      return makeError('#VALUE!');
    return dateToSerial(y, m, d);
  });

  register('TIME', (args) => {
    const h = asNumber(args[0] ?? 0);
    const m = asNumber(args[1] ?? 0);
    const s = asNumber(args[2] ?? 0);
    if (typeof h !== 'number' || typeof m !== 'number' || typeof s !== 'number')
      return makeError('#VALUE!');
    return ((h * 3600 + m * 60 + s) % 86400) / 86400;
  });

  register('YEAR', dateField('y'));
  register('MONTH', dateField('m'));
  register('DAY', dateField('d'));
  register('HOUR', timeField('h'));
  register('MINUTE', timeField('m'));
  register('SECOND', timeField('s'));

  register('WEEKDAY', (args) => {
    const serial = asNumber(args[0] ?? 0);
    const mode = args.length > 1 ? asNumber(args[1]!) : 1;
    if (typeof serial !== 'number' || typeof mode !== 'number') return makeError('#VALUE!');
    const { y, m, d } = serialToDate(Math.floor(serial));
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
    if (mode === 1) return js + 1; // Sun=1..Sat=7
    if (mode === 2) return ((js + 6) % 7) + 1; // Mon=1..Sun=7
    if (mode === 3) return (js + 6) % 7; // Mon=0..Sun=6
    return js + 1;
  });

  register('WEEKNUM', (args) => {
    const serial = asNumber(args[0] ?? 0);
    const mode = args.length > 1 ? asNumber(args[1]!) : 1;
    if (typeof serial !== 'number' || typeof mode !== 'number') return makeError('#VALUE!');
    const target = Math.floor(serial);
    const { y } = serialToDate(target);
    const jan1 = dateToSerial(y, 1, 1);
    const jan1Dow = new Date(Date.UTC(y, 0, 1)).getUTCDay(); // 0=Sun..6=Sat
    if (mode === 21) {
      // ISO 8601: week 1 contains the first Thursday of the year (Mon-based weeks).
      const isoDow = jan1Dow === 0 ? 7 : jan1Dow; // Mon=1..Sun=7
      const monOfWeek1 = jan1 - isoDow + 1 + (isoDow > 4 ? 7 : 0);
      const wk = Math.floor((target - monOfWeek1) / 7) + 1;
      if (wk >= 1) return wk;
      // Date falls in last ISO week of previous year.
      const prevJan1 = dateToSerial(y - 1, 1, 1);
      const prevJan1Dow = new Date(Date.UTC(y - 1, 0, 1)).getUTCDay();
      const prevIsoDow = prevJan1Dow === 0 ? 7 : prevJan1Dow;
      const prevMonOfWeek1 = prevJan1 - prevIsoDow + 1 + (prevIsoDow > 4 ? 7 : 0);
      return Math.floor((target - prevMonOfWeek1) / 7) + 1;
    }
    let startDow: number;
    if (mode === 1 || mode === 17) startDow = 0;
    else if (mode === 2 || mode === 11) startDow = 1;
    else if (mode === 12) startDow = 2;
    else if (mode === 13) startDow = 3;
    else if (mode === 14) startDow = 4;
    else if (mode === 15) startDow = 5;
    else if (mode === 16) startDow = 6;
    else return makeError('#NUM!');
    const offset = (jan1Dow - startDow + 7) % 7;
    const startOfWeek1 = jan1 - offset;
    return Math.floor((target - startOfWeek1) / 7) + 1;
  });

  register('EOMONTH', (args) => {
    const serial = asNumber(args[0] ?? 0);
    const months = asNumber(args[1] ?? 0);
    if (typeof serial !== 'number' || typeof months !== 'number') return makeError('#VALUE!');
    const { y, m } = serialToDate(Math.floor(serial));
    const total = m - 1 + Math.floor(months);
    const newY = y + Math.floor(total / 12);
    const newM = ((total % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(newY, newM + 1, 0)).getUTCDate();
    return dateToSerial(newY, newM + 1, lastDay);
  });

  register('EDATE', (args) => {
    const serial = asNumber(args[0] ?? 0);
    const months = asNumber(args[1] ?? 0);
    if (typeof serial !== 'number' || typeof months !== 'number') return makeError('#VALUE!');
    const { y, m, d } = serialToDate(Math.floor(serial));
    const total = m - 1 + Math.floor(months);
    const newY = y + Math.floor(total / 12);
    const newM = ((total % 12) + 12) % 12;
    const last = new Date(Date.UTC(newY, newM + 1, 0)).getUTCDate();
    return dateToSerial(newY, newM + 1, Math.min(d, last));
  });

  register('DAYS', (args) => {
    const end = asNumber(args[0] ?? 0);
    const start = asNumber(args[1] ?? 0);
    if (typeof end !== 'number' || typeof start !== 'number') return makeError('#VALUE!');
    return Math.floor(end) - Math.floor(start);
  });

  register('DATEDIF', (args) => {
    const start = asNumber(args[0] ?? 0);
    const end = asNumber(args[1] ?? 0);
    const unit = asText(args[2] ?? 'D').toUpperCase();
    if (typeof start !== 'number' || typeof end !== 'number') return makeError('#VALUE!');
    const startInt = Math.floor(start);
    const endInt = Math.floor(end);
    // Excel surfaces #NUM! when end < start.
    if (endInt < startInt) return makeError('#NUM!');
    const sd = serialToDate(startInt);
    const ed = serialToDate(endInt);
    switch (unit) {
      case 'D':
        return endInt - startInt;
      case 'M': {
        let m = (ed.y - sd.y) * 12 + (ed.m - sd.m);
        if (ed.d < sd.d) m--;
        return m;
      }
      case 'Y': {
        let y = ed.y - sd.y;
        if (ed.m < sd.m || (ed.m === sd.m && ed.d < sd.d)) y--;
        return y;
      }
      case 'YM': {
        let m = ed.m - sd.m;
        if (ed.d < sd.d) m--;
        return ((m % 12) + 12) % 12;
      }
      case 'YD': {
        // Days between dates as if they were in the same year.
        const anchor = sd.m > ed.m || (sd.m === ed.m && sd.d > ed.d) ? ed.y - 1 : ed.y;
        const adjStart = dateToSerial(anchor, sd.m, sd.d);
        return endInt - adjStart;
      }
      case 'MD': {
        // Days between, ignoring months and years.
        if (ed.d >= sd.d) return ed.d - sd.d;
        // Borrow from previous month.
        const prevMonthEnd = new Date(Date.UTC(ed.y, ed.m - 1, 0)).getUTCDate();
        return prevMonthEnd - sd.d + ed.d;
      }
      default:
        return makeError('#NUM!');
    }
  });

  register('NETWORKDAYS', (args) => {
    const start = asNumber(args[0] ?? 0);
    const end = asNumber(args[1] ?? 0);
    if (typeof start !== 'number' || typeof end !== 'number') return makeError('#VALUE!');
    const startInt = Math.floor(start);
    const endInt = Math.floor(end);
    const sign = endInt < startInt ? -1 : 1;
    const lo = Math.min(startInt, endInt);
    const hi = Math.max(startInt, endInt);
    // Optional [holidays] argument as a range or array.
    const holidays = new Set<number>();
    if (args.length > 2) {
      for (const s of iterScalars(args[2]!)) {
        if (typeof s === 'number') holidays.add(Math.floor(s));
      }
    }
    let count = 0;
    for (let d = lo; d <= hi; d++) {
      const sd = serialToDate(d);
      const dow = new Date(Date.UTC(sd.y, sd.m - 1, sd.d)).getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidays.has(d)) count++;
    }
    return sign * count;
  });

  register('WORKDAY', (args) => {
    const start = asNumber(args[0] ?? 0);
    const days = asNumber(args[1] ?? 0);
    if (typeof start !== 'number' || typeof days !== 'number') return makeError('#VALUE!');
    const holidays = new Set<number>();
    if (args.length > 2) {
      for (const s of iterScalars(args[2]!)) {
        if (typeof s === 'number') holidays.add(Math.floor(s));
      }
    }
    let d = Math.floor(start);
    let remaining = Math.floor(days);
    const dir = remaining >= 0 ? 1 : -1;
    remaining = Math.abs(remaining);
    while (remaining > 0) {
      d += dir;
      const sd = serialToDate(d);
      const dow = new Date(Date.UTC(sd.y, sd.m - 1, sd.d)).getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidays.has(d)) remaining--;
    }
    return d;
  });

  register('DATEVALUE', (args) => {
    const s = asText(args[0] ?? '').trim();
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const usd = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (iso) return dateToSerial(+iso[1]!, +iso[2]!, +iso[3]!);
    if (usd) {
      let y = +usd[3]!;
      if (y < 100) y += y < 30 ? 2000 : 1900;
      return dateToSerial(y, +usd[1]!, +usd[2]!);
    }
    return makeError('#VALUE!');
  });

  register('TIMEVALUE', (args) => {
    const s = asText(args[0] ?? '').trim();
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?$/i);
    if (!m) return makeError('#VALUE!');
    let h = +m[1]!;
    const mm = +m[2]!;
    const ss = +(m[3] ?? 0);
    if (m[4]) {
      const isPM = m[4].toUpperCase() === 'PM';
      if (h === 12) h = 0;
      if (isPM) h += 12;
    }
    return ((h * 3600 + mm * 60 + ss) % 86400) / 86400;
  });
}

function dateField(which: 'y' | 'm' | 'd') {
  return (args: any[]) => {
    const serial = asNumber(args[0] ?? 0);
    if (typeof serial !== 'number') return serial;
    const d = serialToDate(Math.floor(serial));
    return which === 'y' ? d.y : which === 'm' ? d.m : d.d;
  };
}

function timeField(which: 'h' | 'm' | 's') {
  return (args: any[]) => {
    const serial = asNumber(args[0] ?? 0);
    if (typeof serial !== 'number') return serial;
    const frac = serial - Math.floor(serial);
    const total = Math.round(frac * 86400);
    if (which === 'h') return Math.floor(total / 3600);
    if (which === 'm') return Math.floor((total % 3600) / 60);
    return total % 60;
  };
}
