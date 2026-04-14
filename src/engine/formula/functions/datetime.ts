import { makeError } from '../../cell';
import { dateToSerial, serialToDate } from '../../parse-input';
import { asNumber, asText, register } from '../registry';

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
    if (typeof serial !== 'number') return serial;
    const { y } = serialToDate(Math.floor(serial));
    const jan1 = dateToSerial(y, 1, 1);
    return Math.floor((Math.floor(serial) - jan1) / 7) + 1;
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
    const sd = serialToDate(Math.floor(start));
    const ed = serialToDate(Math.floor(end));
    switch (unit) {
      case 'D':
        return Math.floor(end) - Math.floor(start);
      case 'M': {
        let m = (ed.y - sd.y) * 12 + (ed.m - sd.m);
        if (ed.d < sd.d) m--;
        return Math.max(0, m);
      }
      case 'Y': {
        let y = ed.y - sd.y;
        if (ed.m < sd.m || (ed.m === sd.m && ed.d < sd.d)) y--;
        return Math.max(0, y);
      }
      default:
        return makeError('#NUM!');
    }
  });

  register('NETWORKDAYS', (args) => {
    const start = asNumber(args[0] ?? 0);
    const end = asNumber(args[1] ?? 0);
    if (typeof start !== 'number' || typeof end !== 'number') return makeError('#VALUE!');
    let count = 0;
    const s = Math.min(Math.floor(start), Math.floor(end));
    const e = Math.max(Math.floor(start), Math.floor(end));
    for (let d = s; d <= e; d++) {
      const sd = serialToDate(d);
      const dow = new Date(Date.UTC(sd.y, sd.m - 1, sd.d)).getUTCDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  });

  register('WORKDAY', (args) => {
    const start = asNumber(args[0] ?? 0);
    const days = asNumber(args[1] ?? 0);
    if (typeof start !== 'number' || typeof days !== 'number') return makeError('#VALUE!');
    let d = Math.floor(start);
    let remaining = Math.floor(days);
    const dir = remaining >= 0 ? 1 : -1;
    remaining = Math.abs(remaining);
    while (remaining > 0) {
      d += dir;
      const sd = serialToDate(d);
      const dow = new Date(Date.UTC(sd.y, sd.m - 1, sd.d)).getUTCDay();
      if (dow !== 0 && dow !== 6) remaining--;
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
