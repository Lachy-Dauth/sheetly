/**
 * Evaluator: AST -> value. Uses the function registry for named calls.
 * Exposes `evaluateFormula` for the runtime and `evaluateAst` for reuse.
 */

import type { Address } from '../address';
import { parseRef } from '../address';
import type { Scalar, ArrayValue } from '../cell';
import { isErrorValue, makeError, toNumber, toText } from '../cell';
import type { Workbook } from '../workbook';
import type { AstNode, BinaryOp } from './ast';
import type { EvalContext } from './eval-context';
import { resolveCellValue, resolveRangeArray } from './eval-context';
import { parseFormula } from './parse';
import { lookup as lookupFn } from './registry';
import type { FnValue } from './registry';
import { installAllFunctions } from './functions';

let installed = false;

function ensureInstalled(): void {
  if (!installed) {
    installAllFunctions();
    installed = true;
  }
}

export function evaluateFormula(
  source: string,
  workbook: Workbook,
  sheetId: string,
  cell: Address,
): Scalar {
  ensureInstalled();
  const parsed = parseFormula(source);
  if (!parsed.ok) return makeError('#NAME?', parsed.error);
  const ctx: EvalContext = { workbook, sheetId, cell, trail: new Set() };
  const result = evaluateAst(parsed.ast, ctx);
  return scalarize(result);
}

export function evaluateAst(ast: AstNode, ctx: EvalContext): FnValue {
  switch (ast.kind) {
    case 'literal':
      return ast.value;
    case 'ref': {
      return resolveCellValue(ctx, ast.sheet, ast.address);
    }
    case 'range': {
      return resolveRangeArray(ctx, ast.sheet, ast.range);
    }
    case 'name': {
      const def = ctx.workbook.namedRanges.get(ast.name);
      if (!def) return makeError('#NAME?', `Unknown name ${ast.name}`);
      const parsed = parseRef(def.ref);
      if (!parsed) return makeError('#NAME?');
      if (parsed.kind === 'cell') {
        return resolveCellValue(ctx, parsed.sheet, parsed.start);
      }
      return resolveRangeArray(ctx, parsed.sheet, { start: parsed.start, end: parsed.end });
    }
    case 'unary': {
      const v = evaluateAst(ast.operand, ctx);
      const s = toSingleScalar(v);
      if (isErrorValue(s)) return s;
      if (ast.op === '%') {
        const n = toNumber(s);
        if (typeof n !== 'number') return n;
        return n / 100;
      }
      if (ast.op === '-') {
        const n = toNumber(s);
        if (typeof n !== 'number') return n;
        return -n;
      }
      return s;
    }
    case 'binary': {
      const left = evaluateAst(ast.left, ctx);
      const right = evaluateAst(ast.right, ctx);
      return applyBinary(ast.op, left, right);
    }
    case 'call': {
      const fn = lookupFn(ast.name);
      if (!fn) return makeError('#NAME?', `Unknown function ${ast.name}`);
      const args: FnValue[] = ast.args.map((a) => evaluateAst(a, ctx));
      return fn(args, ctx);
    }
    case 'array': {
      const rows: Scalar[][] = ast.rows.map((r) =>
        r.map((n) => toSingleScalar(evaluateAst(n, ctx))),
      );
      if (rows.length === 1) return rows[0]!.length === 1 ? rows[0]![0]! : rows;
      return rows;
    }
  }
}

function applyBinary(op: BinaryOp, a: FnValue, b: FnValue): FnValue {
  const x = toSingleScalar(a);
  const y = toSingleScalar(b);
  if (isErrorValue(x)) return x;
  if (isErrorValue(y)) return y;
  switch (op) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '^': {
      const xn = toNumber(x);
      if (typeof xn !== 'number') return xn;
      const yn = toNumber(y);
      if (typeof yn !== 'number') return yn;
      switch (op) {
        case '+':
          return xn + yn;
        case '-':
          return xn - yn;
        case '*':
          return xn * yn;
        case '/':
          return yn === 0 ? makeError('#DIV/0!') : xn / yn;
        case '^': {
          const r = Math.pow(xn, yn);
          return Number.isFinite(r) ? r : makeError('#NUM!');
        }
      }
      break;
    }
    case '&':
      return toText(x) + toText(y);
    case '=':
      return compareEq(x, y);
    case '<>':
      return !compareEq(x, y);
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const c = compare(x, y);
      if (typeof c !== 'number') return c;
      switch (op) {
        case '<':
          return c < 0;
        case '>':
          return c > 0;
        case '<=':
          return c <= 0;
        case '>=':
          return c >= 0;
      }
      break;
    }
    case '%': {
      const xn = toNumber(x);
      return typeof xn === 'number' ? xn / 100 : xn;
    }
  }
  return makeError('#VALUE!');
}

function compareEq(x: Scalar, y: Scalar): boolean {
  if (x === null && y === null) return true;
  if (x === null) return y === '' || y === 0 || y === false;
  if (y === null) return x === '' || x === 0 || x === false;
  if (typeof x === 'number' && typeof y === 'number') return x === y;
  if (typeof x === 'boolean' && typeof y === 'boolean') return x === y;
  return toText(x).toLowerCase() === toText(y).toLowerCase();
}

function compare(x: Scalar, y: Scalar): number | { kind: 'error'; code: any } {
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (typeof x === 'boolean' && typeof y === 'boolean') return (x ? 1 : 0) - (y ? 1 : 0);
  if (typeof x === 'string' && typeof y === 'string') {
    return x.localeCompare(y, undefined, { sensitivity: 'accent' });
  }
  if (x === null || y === null) {
    const xn = toNumber(x);
    const yn = toNumber(y);
    if (typeof xn === 'number' && typeof yn === 'number') return xn - yn;
  }
  // Coerce numeric strings.
  const xn = typeof x === 'string' ? Number(x) : NaN;
  const yn = typeof y === 'string' ? Number(y) : NaN;
  if (Number.isFinite(xn) && typeof y === 'number') return xn - y;
  if (typeof x === 'number' && Number.isFinite(yn)) return x - yn;
  return String(x).localeCompare(String(y));
}

function toSingleScalar(v: FnValue): Scalar {
  if (Array.isArray(v)) {
    if (v.length === 0 || v[0]!.length === 0) return null;
    return v[0]![0]!;
  }
  return v;
}

function scalarize(v: FnValue): Scalar {
  // In M3 we don't yet spill arrays into the sheet; collapse to [0,0] scalar.
  return toSingleScalar(v);
}

export { toBool, toNumber, toText, isErrorValue } from '../cell';
export type { FnValue, Scalar, ArrayValue };
