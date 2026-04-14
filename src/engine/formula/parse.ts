/**
 * Pratt parser for Excel-style formula expressions.
 * Returns an AST (see ./ast.ts). Errors report an offset and short message.
 */

import type { AstNode, BinaryOp, UnaryOp } from './ast';
import { parseRef } from '../address';
import type { Token } from './tokens';
import { tokenize } from './tokens';

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

// Precedences follow Excel:
// 1: %  (postfix, handled in unary)
// 2: ^
// 3: * /
// 4: + -
// 5: &
// 6: = <> < > <= >=
const BINARY: Record<string, { prec: number; rightAssoc?: boolean }> = {
  ':': { prec: 8 },
  '^': { prec: 7, rightAssoc: true },
  '*': { prec: 6 },
  '/': { prec: 6 },
  '+': { prec: 5 },
  '-': { prec: 5 },
  '&': { prec: 4 },
  '=': { prec: 3 },
  '<>': { prec: 3 },
  '<': { prec: 3 },
  '>': { prec: 3 },
  '<=': { prec: 3 },
  '>=': { prec: 3 },
};

class Parser {
  private tokens: Token[];
  private pos = 0;
  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  parse(): ParseResult {
    try {
      const ast = this.parseExpr(0);
      if (this.peek().kind !== 'eof') {
        return this.err(`Unexpected token "${this.peek().text}"`);
      }
      return { ok: true, ast };
    } catch (e: unknown) {
      if (e instanceof ParseError) return { ok: false, error: e.message, offset: e.offset };
      throw e;
    }
  }

  private peek(o = 0): Token {
    return this.tokens[this.pos + o] ?? this.tokens[this.tokens.length - 1]!;
  }

  private next(): Token {
    const t = this.tokens[this.pos]!;
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private expect(kind: string, text?: string): Token {
    const t = this.peek();
    if (t.kind !== kind || (text !== undefined && t.text !== text)) {
      throw new ParseError(`Expected ${text ?? kind} but got "${t.text || t.kind}"`, t.start);
    }
    return this.next();
  }

  private err(msg: string): ParseFailure {
    return { ok: false, error: msg, offset: this.peek().start };
  }

  private parseExpr(minPrec: number): AstNode {
    let left = this.parseUnary();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const t = this.peek();
      if (t.kind !== 'op') break;
      const info = BINARY[t.text];
      if (!info || info.prec < minPrec) break;
      this.next();
      const nextMin = info.rightAssoc ? info.prec : info.prec + 1;
      const right = this.parseExpr(nextMin);
      left = { kind: 'binary', op: t.text as BinaryOp, left, right };
    }
    // Postfix %
    while (this.peek().kind === 'op' && this.peek().text === '%') {
      this.next();
      left = { kind: 'unary', op: '%', operand: left };
    }
    return left;
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
      this.next();
      const operand = this.parseUnary();
      return { kind: 'unary', op: t.text as UnaryOp, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const t = this.peek();
    switch (t.kind) {
      case 'number':
        this.next();
        return { kind: 'literal', value: t.value as number };
      case 'string':
        this.next();
        return { kind: 'literal', value: t.value as string };
      case 'bool':
        this.next();
        return { kind: 'literal', value: t.value as boolean };
      case 'error':
        this.next();
        return { kind: 'literal', value: { kind: 'error', code: t.value as any } };
      case 'lparen': {
        this.next();
        const inner = this.parseExpr(0);
        this.expect('rparen');
        return inner;
      }
      case 'lbrace':
        return this.parseArrayLiteral();
      case 'ref':
      case 'range-ref':
        return this.parseRefToken(this.next());
      case 'struct-ref': {
        this.next();
        const v = t.value as { table: string; specifier: string };
        return { kind: 'struct-ref', table: v.table, specifier: v.specifier };
      }
      case 'ident': {
        const name = t.text;
        this.next();
        if (this.peek().kind === 'lparen') {
          this.next();
          const args: AstNode[] = [];
          if (this.peek().kind !== 'rparen') {
            args.push(this.parseExpr(0));
            while (this.peek().kind === 'comma') {
              this.next();
              args.push(this.parseExpr(0));
            }
          }
          this.expect('rparen');
          const { sheet: _s, local } = splitSheet(name);
          return { kind: 'call', name: local.toUpperCase(), args };
        }
        // Named range reference.
        return { kind: 'name', name };
      }
      default:
        throw new ParseError(`Unexpected token "${t.text || t.kind}"`, t.start);
    }
  }

  private parseArrayLiteral(): AstNode {
    this.expect('lbrace');
    const rows: AstNode[][] = [[]];
    while (this.peek().kind !== 'rbrace' && this.peek().kind !== 'eof') {
      rows[rows.length - 1]!.push(this.parseExpr(0));
      if (this.peek().kind === 'comma') {
        this.next();
        continue;
      }
      if (this.peek().kind === 'semicolon') {
        this.next();
        rows.push([]);
        continue;
      }
      break;
    }
    this.expect('rbrace');
    return { kind: 'array', rows };
  }

  private parseRefToken(tok: Token): AstNode {
    const parsed = parseRef(tok.text);
    if (!parsed) throw new ParseError(`Invalid reference "${tok.text}"`, tok.start);
    if (parsed.kind === 'cell') {
      return {
        kind: 'ref',
        sheet: parsed.sheet,
        address: parsed.start,
        absCol: !!parsed.absCol,
        absRow: !!parsed.absRow,
      };
    }
    return {
      kind: 'range',
      sheet: parsed.sheet,
      range: { start: parsed.start, end: parsed.end },
      absStart: { col: !!parsed.absCol, row: !!parsed.absRow },
      absEnd: { col: !!parsed.absCol2, row: !!parsed.absRow2 },
    };
  }
}

class ParseError extends Error {
  constructor(
    msg: string,
    public offset: number,
  ) {
    super(msg);
  }
}

function splitSheet(name: string): { sheet?: string; local: string } {
  if (name.startsWith("'")) {
    const end = name.indexOf("'!");
    if (end > 0) return { sheet: name.slice(1, end).replace(/''/g, "'"), local: name.slice(end + 2) };
  }
  const bang = name.indexOf('!');
  if (bang > 0) return { sheet: name.slice(0, bang), local: name.slice(bang + 1) };
  return { local: name };
}

export function parseFormula(source: string): ParseResult {
  return new Parser(source).parse();
}
