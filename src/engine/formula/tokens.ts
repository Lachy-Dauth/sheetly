/**
 * Formula tokeniser. Converts a source string into a list of typed tokens.
 * Whitespace is skipped (except inside strings). Errors surface via a `bad`
 * token so the parser can produce a useful diagnostic.
 */

export type TokenKind =
  | 'number'
  | 'string'
  | 'ident'
  | 'ref'
  | 'range-ref'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'comma'
  | 'semicolon'
  | 'bool'
  | 'error'
  | 'bad'
  | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  value?: number | string | boolean;
}

const OPS = ['<>', '<=', '>=', '<', '>', '=', '+', '-', '*', '/', '%', '^', '&'];

const ERROR_CODES = new Set([
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#NULL!',
  '#CIRC!',
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', text: '(', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', text: ')', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '{') {
      tokens.push({ kind: 'lbrace', text: '{', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '}') {
      tokens.push({ kind: 'rbrace', text: '}', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', text: ',', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ';') {
      tokens.push({ kind: 'semicolon', text: ';', start: i, end: i + 1 });
      i++;
      continue;
    }
    // Strings with double-quote escapes.
    if (c === '"') {
      const start = i;
      let j = i + 1;
      let out = '';
      while (j < len) {
        const ch = source[j]!;
        if (ch === '"') {
          if (source[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          break;
        }
        out += ch;
        j++;
      }
      if (j >= len) {
        tokens.push({ kind: 'bad', text: source.slice(start), start, end: j });
      } else {
        tokens.push({ kind: 'string', text: source.slice(start, j + 1), start, end: j + 1, value: out });
      }
      i = j + 1;
      continue;
    }
    // Errors like #DIV/0!
    if (c === '#') {
      // Longest-match error code.
      let match = '';
      for (const code of ERROR_CODES) {
        if (source.startsWith(code, i) && code.length > match.length) match = code;
      }
      if (match) {
        tokens.push({ kind: 'error', text: match, start: i, end: i + match.length, value: match });
        i += match.length;
        continue;
      }
      tokens.push({ kind: 'bad', text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    // Numbers: leading digit or .digit.
    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      let j = i;
      while (j < len && isDigit(source[j]!)) j++;
      if (source[j] === '.') {
        j++;
        while (j < len && isDigit(source[j]!)) j++;
      }
      if (source[j] === 'e' || source[j] === 'E') {
        j++;
        if (source[j] === '+' || source[j] === '-') j++;
        while (j < len && isDigit(source[j]!)) j++;
      }
      const text = source.slice(i, j);
      tokens.push({ kind: 'number', text, start: i, end: j, value: parseFloat(text) });
      i = j;
      continue;
    }
    // Operators (longest-match).
    let matched = '';
    for (const op of OPS) {
      if (source.startsWith(op, i) && op.length > matched.length) matched = op;
    }
    if (matched) {
      tokens.push({ kind: 'op', text: matched, start: i, end: i + matched.length });
      i += matched.length;
      continue;
    }
    // Identifiers / refs (possibly with sheet prefix and/or $).
    if (isIdentStart(c) || c === "'" || c === '$') {
      const start = i;
      let sheet: string | undefined;
      if (c === "'") {
        let j = i + 1;
        while (j < len && source[j] !== "'") j++;
        sheet = source.slice(i + 1, j).replace(/''/g, "'");
        i = j + 1;
        if (source[i] !== '!') {
          tokens.push({ kind: 'bad', text: source.slice(start, i), start, end: i });
          continue;
        }
        i++;
      } else {
        // unquoted sheet: word followed by '!'
        let j = i;
        while (j < len && (isIdentPart(source[j]!) || source[j] === ' ')) j++;
        if (source[j] === '!' && !/^[A-Z]+\d+$/i.test(source.slice(i, j))) {
          sheet = source.slice(i, j).trim();
          i = j + 1;
        }
      }
      // Now parse a ref ($col$row) or identifier.
      const refStart = i;
      const refMatch = /^\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/.exec(source.slice(i));
      if (refMatch) {
        const end = i + refMatch[0].length;
        const text = (sheet ? (sheet.includes(' ') ? `'${sheet}'!` : sheet + '!') : '') + refMatch[0];
        tokens.push({
          kind: refMatch[0].includes(':') ? 'range-ref' : 'ref',
          text,
          start,
          end,
          value: text,
        });
        i = end;
        continue;
      }
      // Identifier / function name.
      let j = i;
      while (j < len && isIdentPart(source[j]!)) j++;
      if (j === i) {
        tokens.push({ kind: 'bad', text: source.slice(start, i + 1), start, end: i + 1 });
        i++;
        continue;
      }
      const id = source.slice(refStart, j);
      const up = id.toUpperCase();
      if (up === 'TRUE' || up === 'FALSE') {
        tokens.push({ kind: 'bool', text: up, start, end: j, value: up === 'TRUE' });
      } else {
        const text = (sheet ? (sheet.includes(' ') ? `'${sheet}'!` : sheet + '!') : '') + id;
        tokens.push({ kind: 'ident', text, start, end: j, value: text });
      }
      i = j;
      continue;
    }
    tokens.push({ kind: 'bad', text: c, start: i, end: i + 1 });
    i++;
  }
  tokens.push({ kind: 'eof', text: '', start: len, end: len });
  return tokens;
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c) || c === '.';
}
