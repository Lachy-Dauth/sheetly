/**
 * Data validation: rules bound to ranges, evaluated against new cell values.
 * The workbook consults `validateCellInput` before committing an edit; the UI
 * surfaces the error message when validation fails.
 */

import type { Address, RangeAddress } from './address';
import { normalizeRange } from './address';
import type { Scalar } from './cell';
import { isErrorValue, toNumber, toText } from './cell';
import type { Sheet } from './sheet';
import type { Workbook } from './workbook';
import { evaluateFormula } from './formula/eval';

export type ValidationRule =
  | { kind: 'list'; values: string[]; strict?: boolean }
  | { kind: 'numberRange'; min?: number; max?: number }
  | { kind: 'textLength'; min?: number; max?: number }
  | { kind: 'formula'; formula: string }
  | { kind: 'none' };

export interface Validation {
  id: string;
  range: RangeAddress;
  rule: ValidationRule;
  error?: string;
}

let nextId = 1;
export function makeValidationId(): string {
  return `v${nextId++}`;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

/** Find the first validation that applies to `a`. */
export function findValidation(sheet: Sheet, a: Address): Validation | undefined {
  for (const v of sheet.validations) {
    const r = normalizeRange(v.range);
    if (a.row >= r.start.row && a.row <= r.end.row && a.col >= r.start.col && a.col <= r.end.col) {
      return v;
    }
  }
  return undefined;
}

/** Validate a value against a rule. */
export function validateValue(
  rule: ValidationRule,
  value: Scalar,
  workbook: Workbook,
  sheet: Sheet,
  address: Address,
): ValidationResult {
  if (value === null || value === '') return { ok: true };
  switch (rule.kind) {
    case 'none':
      return { ok: true };
    case 'list': {
      const text = toText(value);
      if (rule.values.includes(text)) return { ok: true };
      if (!rule.strict) return { ok: true };
      return { ok: false, message: `Value must be one of: ${rule.values.join(', ')}` };
    }
    case 'numberRange': {
      const n = toNumber(value);
      if (typeof n !== 'number') return { ok: false, message: 'Value must be numeric' };
      if (rule.min !== undefined && n < rule.min) return { ok: false, message: `Must be ≥ ${rule.min}` };
      if (rule.max !== undefined && n > rule.max) return { ok: false, message: `Must be ≤ ${rule.max}` };
      return { ok: true };
    }
    case 'textLength': {
      const len = toText(value).length;
      if (rule.min !== undefined && len < rule.min) return { ok: false, message: `Must be at least ${rule.min} chars` };
      if (rule.max !== undefined && len > rule.max) return { ok: false, message: `Must be at most ${rule.max} chars` };
      return { ok: true };
    }
    case 'formula': {
      const result = evaluateFormula(rule.formula, workbook, sheet.id, address);
      // An ErrorValue is truthy in JS, so `!!result` would silently pass it —
      // surface formula errors as validation failures instead.
      if (isErrorValue(result)) return { ok: false, message: `Validation formula error: ${result.code}` };
      if (typeof result === 'boolean') return result ? { ok: true } : { ok: false, message: 'Validation formula returned FALSE' };
      if (typeof result === 'number') return result !== 0 ? { ok: true } : { ok: false, message: 'Validation formula returned 0' };
      if (result === null || result === '') return { ok: false, message: 'Validation formula returned blank' };
      return { ok: true };
    }
  }
}

export function validateCellInput(
  workbook: Workbook,
  sheet: Sheet,
  address: Address,
  value: Scalar,
): ValidationResult {
  const v = findValidation(sheet, address);
  if (!v) return { ok: true };
  const result = validateValue(v.rule, value, workbook, sheet, address);
  if (!result.ok && v.error) return { ok: false, message: v.error };
  return result;
}
