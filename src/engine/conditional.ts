/**
 * Conditional formatting rules and evaluator.
 *
 * Rules are stored on each sheet as an ordered list. `evaluateRules` walks
 * the list in priority order and produces a per-cell `CfOverlay` describing
 * the visual override that the painter should apply. `stopIfTrue` short-
 * circuits later rules on matched cells.
 */

import type { Address, RangeAddress } from './address';
import { cellKey, normalizeRange } from './address';
import type { Scalar } from './cell';
import { isErrorValue, toNumber, toText } from './cell';
import type { Sheet } from './sheet';
import type { Workbook } from './workbook';
import { evaluateFormula } from './formula/eval';

export type CellIsOp =
  | '>'
  | '>='
  | '<'
  | '<='
  | '='
  | '<>'
  | 'between'
  | 'notBetween'
  | 'contains'
  | 'notContains'
  | 'beginsWith'
  | 'endsWith';

export interface RuleStyle {
  fill?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export type ConditionalRule =
  | ({ kind: 'cellIs'; op: CellIsOp; value: Scalar; value2?: Scalar; style: RuleStyle } & RuleBase)
  | ({ kind: 'topBottom'; n: number; percent?: boolean; top: boolean; style: RuleStyle } & RuleBase)
  | ({ kind: 'aboveBelowAvg'; above: boolean; style: RuleStyle } & RuleBase)
  | ({ kind: 'duplicates'; mode: 'duplicate' | 'unique'; style: RuleStyle } & RuleBase)
  | ({ kind: 'formula'; formula: string; style: RuleStyle } & RuleBase)
  | ({
      kind: 'colorScale';
      min: { kind: 'min' | 'number' | 'percent'; value?: number; color: string };
      mid?: { kind: 'percent' | 'number'; value: number; color: string };
      max: { kind: 'max' | 'number' | 'percent'; value?: number; color: string };
    } & RuleBase)
  | ({ kind: 'dataBar'; color: string; showValue?: boolean } & RuleBase);

interface RuleBase {
  id: string;
  range: RangeAddress;
  priority: number;
  stopIfTrue?: boolean;
}

export interface CfOverlay {
  fill?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  dataBar?: { color: string; fraction: number };
}

let nextRuleId = 1;
export function makeRuleId(): string {
  return `cf${nextRuleId++}`;
}

/** Distribute Omit over the ConditionalRule union. */
export type NewRule = ConditionalRule extends infer R
  ? R extends ConditionalRule
    ? Omit<R, 'id' | 'priority'> & { priority?: number }
    : never
  : never;

/** Gather the numeric values in a range; used by many rule kinds. */
function collectNumericValues(sheet: Sheet, range: RangeAddress): number[] {
  const out: number[] = [];
  const r = normalizeRange(range);
  for (let row = r.start.row; row <= r.end.row; row++) {
    for (let col = r.start.col; col <= r.end.col; col++) {
      const cell = sheet.getCell({ row, col });
      if (!cell) continue;
      const raw = cell.computed ?? cell.value ?? null;
      if (typeof raw === 'number') out.push(raw);
    }
  }
  return out;
}

function scalarOf(sheet: Sheet, a: Address): Scalar {
  const cell = sheet.getCell(a);
  if (!cell) return null;
  return cell.computed ?? cell.value ?? cell.raw;
}

function rangeContains(range: RangeAddress, a: Address): boolean {
  const r = normalizeRange(range);
  return a.row >= r.start.row && a.row <= r.end.row && a.col >= r.start.col && a.col <= r.end.col;
}

/** Returns true if rule predicate holds for `a`. */
function matchPredicate(
  rule: ConditionalRule,
  sheet: Sheet,
  workbook: Workbook,
  a: Address,
): boolean {
  const v = scalarOf(sheet, a);
  switch (rule.kind) {
    case 'cellIs':
      return cellIsMatch(v, rule.op, rule.value, rule.value2);
    case 'topBottom': {
      const nums = collectNumericValues(sheet, rule.range);
      if (nums.length === 0 || typeof v !== 'number') return false;
      const sorted = [...nums].sort((x, y) => (rule.top ? y - x : x - y));
      const cutoffIndex = rule.percent
        ? Math.max(0, Math.floor((rule.n / 100) * sorted.length) - 1)
        : Math.min(sorted.length - 1, rule.n - 1);
      const cutoff = sorted[cutoffIndex]!;
      return rule.top ? v >= cutoff : v <= cutoff;
    }
    case 'aboveBelowAvg': {
      const nums = collectNumericValues(sheet, rule.range);
      if (nums.length === 0 || typeof v !== 'number') return false;
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      return rule.above ? v > mean : v < mean;
    }
    case 'duplicates': {
      const counts = new Map<string, number>();
      const r = normalizeRange(rule.range);
      for (let row = r.start.row; row <= r.end.row; row++) {
        for (let col = r.start.col; col <= r.end.col; col++) {
          const x = scalarOf(sheet, { row, col });
          if (x === null || x === '') continue;
          const k = toText(x);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      if (v === null || v === '') return false;
      const count = counts.get(toText(v)) ?? 0;
      return rule.mode === 'duplicate' ? count > 1 : count === 1;
    }
    case 'formula': {
      const result = evaluateFormula(rule.formula, workbook, sheet.id, a);
      if (isErrorValue(result)) return false;
      if (typeof result === 'boolean') return result;
      if (typeof result === 'number') return result !== 0;
      return !!result;
    }
    default:
      return false;
  }
}

function cellIsMatch(v: Scalar, op: CellIsOp, val: Scalar, val2?: Scalar): boolean {
  if (v === null || v === '') return false;
  const n = typeof v === 'number' ? v : Number(toText(v));
  const cn = typeof val === 'number' ? val : Number(toText(val ?? ''));
  const useNumeric = Number.isFinite(n) && Number.isFinite(cn);
  const sv = toText(v).toLowerCase();
  const svcmp = toText(val ?? '').toLowerCase();
  switch (op) {
    case '>':
      return useNumeric ? n > cn : sv > svcmp;
    case '>=':
      return useNumeric ? n >= cn : sv >= svcmp;
    case '<':
      return useNumeric ? n < cn : sv < svcmp;
    case '<=':
      return useNumeric ? n <= cn : sv <= svcmp;
    case '=':
      return useNumeric ? n === cn : sv === svcmp;
    case '<>':
      return useNumeric ? n !== cn : sv !== svcmp;
    case 'between':
    case 'notBetween': {
      const cn2 = typeof val2 === 'number' ? val2 : Number(toText(val2 ?? ''));
      if (!Number.isFinite(cn2) || !useNumeric) return false;
      const lo = Math.min(cn, cn2);
      const hi = Math.max(cn, cn2);
      const inside = n >= lo && n <= hi;
      return op === 'between' ? inside : !inside;
    }
    case 'contains':
      return sv.includes(svcmp);
    case 'notContains':
      return !sv.includes(svcmp);
    case 'beginsWith':
      return sv.startsWith(svcmp);
    case 'endsWith':
      return sv.endsWith(svcmp);
  }
}

/** Linear blend between two hex colors (#rrggbb). `t` in [0, 1]. */
function blend(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * clamp);
  const g = Math.round(pa.g + (pb.g - pa.g) * clamp);
  const bl = Math.round(pa.b + (pb.b - pa.b) * clamp);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function pickColorForScale(
  rule: Extract<ConditionalRule, { kind: 'colorScale' }>,
  v: number,
  lo: number,
  hi: number,
): string {
  if (hi === lo) return rule.min.color;
  const t = (v - lo) / (hi - lo);
  if (rule.mid) {
    if (t < 0.5) return blend(rule.min.color, rule.mid.color, t * 2);
    return blend(rule.mid.color, rule.max.color, (t - 0.5) * 2);
  }
  return blend(rule.min.color, rule.max.color, t);
}

function mergeOverlay(into: CfOverlay, patch: CfOverlay | RuleStyle): CfOverlay {
  if ('fill' in patch && patch.fill !== undefined) into.fill = patch.fill;
  if ('color' in patch && patch.color !== undefined) into.color = patch.color;
  if ('bold' in patch && patch.bold !== undefined) into.bold = patch.bold;
  if ('italic' in patch && patch.italic !== undefined) into.italic = patch.italic;
  if ('dataBar' in patch && patch.dataBar !== undefined) into.dataBar = patch.dataBar;
  return into;
}

/**
 * Evaluate every rule on a sheet, returning a sparse map of per-cell overlays.
 * The caller (painter) is expected to intersect this with the visible viewport.
 */
export function evaluateRules(sheet: Sheet, workbook: Workbook): Map<number, CfOverlay> {
  const out = new Map<number, CfOverlay>();
  const rules = [...sheet.conditionalRules].sort((a, b) => a.priority - b.priority);
  const stopped = new Set<number>();

  for (const rule of rules) {
    const r = normalizeRange(rule.range);
    if (rule.kind === 'colorScale') {
      const nums = collectNumericValues(sheet, rule.range);
      if (nums.length === 0) continue;
      const lo =
        rule.min.kind === 'min'
          ? Math.min(...nums)
          : rule.min.kind === 'percent'
            ? percentile(nums, rule.min.value ?? 0)
            : (rule.min.value ?? 0);
      const hi =
        rule.max.kind === 'max'
          ? Math.max(...nums)
          : rule.max.kind === 'percent'
            ? percentile(nums, rule.max.value ?? 100)
            : (rule.max.value ?? 100);
      for (let row = r.start.row; row <= r.end.row; row++) {
        for (let col = r.start.col; col <= r.end.col; col++) {
          const key = cellKey(row, col);
          if (stopped.has(key)) continue;
          const v = scalarOf(sheet, { row, col });
          if (typeof v !== 'number') continue;
          const color = pickColorForScale(rule, v, lo, hi);
          const current = out.get(key) ?? {};
          mergeOverlay(current, { fill: color });
          out.set(key, current);
          if (rule.stopIfTrue) stopped.add(key);
        }
      }
      continue;
    }
    if (rule.kind === 'dataBar') {
      const nums = collectNumericValues(sheet, rule.range);
      if (nums.length === 0) continue;
      const lo = Math.min(...nums, 0);
      const hi = Math.max(...nums, 0);
      const span = hi - lo || 1;
      for (let row = r.start.row; row <= r.end.row; row++) {
        for (let col = r.start.col; col <= r.end.col; col++) {
          const key = cellKey(row, col);
          if (stopped.has(key)) continue;
          const v = scalarOf(sheet, { row, col });
          if (typeof v !== 'number') continue;
          const fraction = Math.max(0, Math.min(1, (v - lo) / span));
          const current = out.get(key) ?? {};
          mergeOverlay(current, { dataBar: { color: rule.color, fraction } });
          out.set(key, current);
          if (rule.stopIfTrue) stopped.add(key);
        }
      }
      continue;
    }
    // Boolean rules: iterate, test predicate, merge style.
    for (let row = r.start.row; row <= r.end.row; row++) {
      for (let col = r.start.col; col <= r.end.col; col++) {
        const key = cellKey(row, col);
        if (stopped.has(key)) continue;
        if (!rangeContains(rule.range, { row, col })) continue;
        if (!matchPredicate(rule, sheet, workbook, { row, col })) continue;
        const current = out.get(key) ?? {};
        mergeOverlay(current, rule.style);
        out.set(key, current);
        if (rule.stopIfTrue) stopped.add(key);
      }
    }
  }
  return out;
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

// Helpers for callers that need to coerce a Scalar for rule value inputs.
export function coerceRuleValue(text: string): Scalar {
  if (text === '') return null;
  const n = Number(text);
  if (Number.isFinite(n) && String(n) === text.trim()) return n;
  const asNum = toNumber(text);
  if (typeof asNum === 'number') return asNum;
  return text;
}
