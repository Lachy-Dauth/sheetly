/**
 * Placeholder for M3. Full Pratt parser lands with the formula engine.
 * Returns an empty AST that evaluates to an empty value.
 */

import type { AstNode } from './ast';

export interface ParseSuccess {
  ok: true;
  ast: AstNode;
}
export interface ParseFailure {
  ok: false;
  error: string;
  offset: number;
}
export type ParseResult = ParseSuccess | ParseFailure;

export function parseFormula(_source: string): ParseResult {
  return { ok: true, ast: { kind: 'literal', value: null } };
}
