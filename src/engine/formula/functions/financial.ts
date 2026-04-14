import { makeError } from '../../cell';
import { asNumber, flattenNumbers, register } from '../registry';

export function installFinancial(): void {
  register('PMT', (args) => {
    const rate = asNumber(args[0] ?? 0);
    const n = asNumber(args[1] ?? 0);
    const pv = asNumber(args[2] ?? 0);
    const fv = args.length > 3 ? asNumber(args[3]!) : 0;
    const type = args.length > 4 ? asNumber(args[4]!) : 0;
    if (anyErr(rate, n, pv, fv, type)) return makeError('#VALUE!');
    return pmt(rate as number, n as number, pv as number, fv as number, type as number);
  });

  register('PV', (args) => {
    const rate = asNumber(args[0] ?? 0);
    const n = asNumber(args[1] ?? 0);
    const p = asNumber(args[2] ?? 0);
    const fv = args.length > 3 ? asNumber(args[3]!) : 0;
    const type = args.length > 4 ? asNumber(args[4]!) : 0;
    if (anyErr(rate, n, p, fv, type)) return makeError('#VALUE!');
    const r = rate as number;
    const N = n as number;
    if (r === 0) return -(p as number) * N - (fv as number);
    const factor = Math.pow(1 + r, N);
    return -(((p as number) * ((1 + r * (type as number)) * (factor - 1))) / r + (fv as number)) / factor;
  });

  register('FV', (args) => {
    const rate = asNumber(args[0] ?? 0);
    const n = asNumber(args[1] ?? 0);
    const p = asNumber(args[2] ?? 0);
    const pv = args.length > 3 ? asNumber(args[3]!) : 0;
    const type = args.length > 4 ? asNumber(args[4]!) : 0;
    if (anyErr(rate, n, p, pv, type)) return makeError('#VALUE!');
    const r = rate as number;
    const N = n as number;
    if (r === 0) return -(pv as number) - (p as number) * N;
    const factor = Math.pow(1 + r, N);
    return -((pv as number) * factor + (p as number) * ((1 + r * (type as number)) * (factor - 1)) / r);
  });

  register('NPER', (args) => {
    const rate = asNumber(args[0] ?? 0);
    const pmtAmt = asNumber(args[1] ?? 0);
    const pv = asNumber(args[2] ?? 0);
    const fv = args.length > 3 ? asNumber(args[3]!) : 0;
    const type = args.length > 4 ? asNumber(args[4]!) : 0;
    if (anyErr(rate, pmtAmt, pv, fv, type)) return makeError('#VALUE!');
    const r = rate as number;
    if (r === 0) return -((pv as number) + (fv as number)) / (pmtAmt as number);
    const numerator = (pmtAmt as number) * (1 + r * (type as number)) - (fv as number) * r;
    const denominator = (pv as number) * r + (pmtAmt as number) * (1 + r * (type as number));
    return Math.log(numerator / denominator) / Math.log(1 + r);
  });

  register('RATE', (args) => {
    const n = asNumber(args[0] ?? 0);
    const pmtAmt = asNumber(args[1] ?? 0);
    const pv = asNumber(args[2] ?? 0);
    const fv = args.length > 3 ? asNumber(args[3]!) : 0;
    const type = args.length > 4 ? asNumber(args[4]!) : 0;
    let guess = args.length > 5 ? asNumber(args[5]!) : 0.1;
    if (anyErr(n, pmtAmt, pv, fv, type, guess)) return makeError('#VALUE!');
    let r = guess as number;
    for (let i = 0; i < 50; i++) {
      const f = rateFn(r, n as number, pmtAmt as number, pv as number, fv as number, type as number);
      const d = rateFnDeriv(r, n as number, pmtAmt as number, pv as number, fv as number, type as number);
      if (Math.abs(d) < 1e-12) break;
      const next = r - f / d;
      if (Math.abs(next - r) < 1e-10) return next;
      r = next;
    }
    return r;
  });

  register('NPV', (args) => {
    const rate = asNumber(args[0] ?? 0);
    if (typeof rate !== 'number') return rate;
    const { nums } = flattenNumbers(args.slice(1));
    let total = 0;
    for (let i = 0; i < nums.length; i++) total += nums[i]! / Math.pow(1 + rate, i + 1);
    return total;
  });

  register('IRR', (args) => {
    const { nums } = flattenNumbers([args[0]!]);
    let guess = args.length > 1 ? asNumber(args[1]!) : 0.1;
    if (typeof guess !== 'number') return guess;
    let r = guess;
    for (let i = 0; i < 100; i++) {
      let npv = 0;
      let dnpv = 0;
      for (let t = 0; t < nums.length; t++) {
        npv += nums[t]! / Math.pow(1 + r, t);
        dnpv -= (t * nums[t]!) / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(dnpv) < 1e-12) break;
      const next = r - npv / dnpv;
      if (Math.abs(next - r) < 1e-10) return next;
      r = next;
    }
    return r;
  });

  register('MIRR', (args) => {
    const { nums } = flattenNumbers([args[0]!]);
    const financeRate = asNumber(args[1] ?? 0);
    const reinvestRate = asNumber(args[2] ?? 0);
    if (typeof financeRate !== 'number' || typeof reinvestRate !== 'number') return makeError('#VALUE!');
    const n = nums.length;
    if (n < 2) return makeError('#DIV/0!');
    let pvNeg = 0;
    let fvPos = 0;
    for (let t = 0; t < n; t++) {
      if (nums[t]! < 0) pvNeg += nums[t]! / Math.pow(1 + financeRate, t);
      else fvPos += nums[t]! * Math.pow(1 + reinvestRate, n - 1 - t);
    }
    if (pvNeg === 0 || fvPos === 0) return makeError('#DIV/0!');
    return Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1;
  });

  register('IPMT', (args) => {
    const r = asNumber(args[0] ?? 0) as number;
    const per = asNumber(args[1] ?? 0) as number;
    const n = asNumber(args[2] ?? 0) as number;
    const pv = asNumber(args[3] ?? 0) as number;
    const fv = args.length > 4 ? (asNumber(args[4]!) as number) : 0;
    const type = args.length > 5 ? (asNumber(args[5]!) as number) : 0;
    const p = pmt(r, n, pv, fv, type);
    let bal = pv;
    let interest = 0;
    for (let k = 1; k <= per; k++) {
      interest = r * bal;
      bal += interest + p;
    }
    return interest;
  });

  register('PPMT', (args) => {
    const r = asNumber(args[0] ?? 0) as number;
    const per = asNumber(args[1] ?? 0) as number;
    const n = asNumber(args[2] ?? 0) as number;
    const pv = asNumber(args[3] ?? 0) as number;
    const fv = args.length > 4 ? (asNumber(args[4]!) as number) : 0;
    const type = args.length > 5 ? (asNumber(args[5]!) as number) : 0;
    const p = pmt(r, n, pv, fv, type);
    let bal = pv;
    for (let k = 1; k < per; k++) bal += r * bal + p;
    return p - r * bal;
  });

  register('SLN', (args) => {
    const cost = asNumber(args[0] ?? 0);
    const salvage = asNumber(args[1] ?? 0);
    const life = asNumber(args[2] ?? 0);
    if (typeof cost !== 'number' || typeof salvage !== 'number' || typeof life !== 'number')
      return makeError('#VALUE!');
    if (life === 0) return makeError('#DIV/0!');
    return (cost - salvage) / life;
  });

  register('DB', (args) => {
    const cost = asNumber(args[0] ?? 0) as number;
    const salvage = asNumber(args[1] ?? 0) as number;
    const life = asNumber(args[2] ?? 0) as number;
    const period = asNumber(args[3] ?? 0) as number;
    const rate = 1 - Math.pow(salvage / cost, 1 / life);
    let totalDepr = 0;
    for (let p = 1; p < period; p++) totalDepr += (cost - totalDepr) * rate;
    return (cost - totalDepr) * rate;
  });

  register('DDB', (args) => {
    const cost = asNumber(args[0] ?? 0) as number;
    const salvage = asNumber(args[1] ?? 0) as number;
    const life = asNumber(args[2] ?? 0) as number;
    const period = asNumber(args[3] ?? 0) as number;
    const factor = args.length > 4 ? (asNumber(args[4]!) as number) : 2;
    let bookValue = cost;
    let depr = 0;
    for (let p = 1; p <= period; p++) {
      depr = Math.min((bookValue * factor) / life, bookValue - salvage);
      bookValue -= depr;
    }
    return depr;
  });
}

function pmt(rate: number, n: number, pv: number, fv: number, type: number): number {
  if (n === 0) return 0;
  if (rate === 0) return -(pv + fv) / n;
  const factor = Math.pow(1 + rate, n);
  return (-rate * (pv * factor + fv)) / ((1 + rate * type) * (factor - 1));
}

function rateFn(r: number, n: number, p: number, pv: number, fv: number, type: number): number {
  if (r === 0) return pv + p * n + fv;
  return pv * Math.pow(1 + r, n) + p * (1 + r * type) * (Math.pow(1 + r, n) - 1) / r + fv;
}

function rateFnDeriv(r: number, n: number, p: number, pv: number, fv: number, type: number): number {
  const h = 1e-6;
  return (rateFn(r + h, n, p, pv, fv, type) - rateFn(r - h, n, p, pv, fv, type)) / (2 * h);
}

function anyErr(...vs: Array<number | { kind: 'error' }>): boolean {
  return vs.some((v) => typeof v !== 'number');
}
