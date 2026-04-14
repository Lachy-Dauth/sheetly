/**
 * Formula AST node types. Concrete construction lives in `parse.ts`.
 */

import type { Address, RangeAddress } from '../address';
import type { Scalar } from '../cell';

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '&'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>=';

export type UnaryOp = '+' | '-' | '%';

export type AstNode =
  | { kind: 'literal'; value: Scalar }
  | { kind: 'ref'; sheet?: string; address: Address; absCol: boolean; absRow: boolean }
  | {
      kind: 'range';
      sheet?: string;
      range: RangeAddress;
      absStart: { col: boolean; row: boolean };
      absEnd: { col: boolean; row: boolean };
    }
  | { kind: 'name'; name: string }
  | { kind: 'unary'; op: UnaryOp; operand: AstNode }
  | { kind: 'binary'; op: BinaryOp; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] }
  | { kind: 'array'; rows: AstNode[][] };
