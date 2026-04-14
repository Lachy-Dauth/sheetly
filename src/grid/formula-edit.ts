/**
 * Helpers used by the cell editor while the user is typing a formula:
 *
 *   - `cycleAbsolute(text, caret)` — F4 toggles `$` markers on the reference
 *     under or just before the caret (A1 → $A$1 → A$1 → $A1 → A1).
 *   - `acceptsRefAt(text, caret)` — true when the caret sits where a cell
 *     reference can legally be inserted (after `=`, `,`, `(`, an operator,
 *     or while replacing an existing trailing reference).
 *   - `findTrailingRef(text, caret)` — returns the [start, end) range of the
 *     reference token that immediately precedes the caret, if the caret looks
 *     like it's currently editing a reference. Used to overwrite the previous
 *     ref when the user clicks a different cell on the grid.
 */

import { tokenize } from '../engine/formula/tokens';

const REF_BODY = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/;

/**
 * Cycle the absolute markers on the A1-style reference under the caret.
 * Returns the new text and where the caret should land afterwards.
 */
export function cycleAbsolute(
  text: string,
  caret: number,
): { text: string; caret: number } {
  if (!text.startsWith('=')) return { text, caret };
  const body = text.slice(1);
  const tokens = tokenize(body);
  const offsetCaret = caret - 1; // body coordinates
  for (const tok of tokens) {
    if (tok.kind !== 'ref' && tok.kind !== 'range-ref') continue;
    // Treat the caret as being on this token if it sits within or directly
    // adjacent to the token text.
    if (offsetCaret < tok.start || offsetCaret > tok.end) continue;
    const replaced = cycleRefText(tok.text);
    if (replaced === tok.text) continue;
    const next = '=' + body.slice(0, tok.start) + replaced + body.slice(tok.end);
    // Place caret at the end of the replaced ref so a second F4 keeps cycling.
    const newCaret = 1 + tok.start + replaced.length;
    return { text: next, caret: newCaret };
  }
  return { text, caret };
}

function cycleRefText(text: string): string {
  // Range refs: cycle each end with the same step so the visual feel matches
  // single-cell refs (Excel cycles the whole range together).
  if (text.includes(':')) {
    const colonIdx = text.indexOf(':');
    return cycleRefText(text.slice(0, colonIdx)) + ':' + cycleRefText(text.slice(colonIdx + 1));
  }
  // Strip any sheet prefix; we only cycle the local part.
  const bangIdx = text.lastIndexOf('!');
  const prefix = bangIdx >= 0 ? text.slice(0, bangIdx + 1) : '';
  const local = bangIdx >= 0 ? text.slice(bangIdx + 1) : text;
  const m = local.match(REF_BODY);
  if (!m) return text;
  const absCol = m[1] === '$';
  const colLetters = m[2]!;
  const absRow = m[3] === '$';
  const rowNum = m[4]!;
  // Cycle order: (rel,rel) → ($,$) → (rel,$) → ($,rel) → (rel,rel)
  // Encoded as `${absCol}${absRow}` flag pairs: 00 → 11 → 01 → 10 → 00.
  let nextCol: boolean;
  let nextRow: boolean;
  if (!absCol && !absRow) {
    nextCol = true; nextRow = true;
  } else if (absCol && absRow) {
    nextCol = false; nextRow = true;
  } else if (!absCol && absRow) {
    nextCol = true; nextRow = false;
  } else {
    nextCol = false; nextRow = false;
  }
  return `${prefix}${nextCol ? '$' : ''}${colLetters}${nextRow ? '$' : ''}${rowNum}`;
}

/**
 * Returns true when the caret position is in a place where a fresh reference
 * could legally be inserted (or where the user has just finished typing one
 * and is still in "ref selection" mode).
 */
export function acceptsRefAt(text: string, caret: number): boolean {
  if (!text.startsWith('=')) return false;
  if (caret <= 0 || caret > text.length) return false;
  // Walk back over whitespace.
  let i = caret - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i < 0) return false;
  const ch = text[i]!;
  if (
    ch === '=' ||
    ch === ',' ||
    ch === '(' ||
    ch === '+' ||
    ch === '-' ||
    ch === '*' ||
    ch === '/' ||
    ch === '^' ||
    ch === '&' ||
    ch === '<' ||
    ch === '>' ||
    ch === ';' ||
    ch === ':'
  ) {
    return true;
  }
  // The caret may already be sitting at the end of a reference the user is
  // about to overwrite by clicking somewhere else.
  return findTrailingRef(text, caret) !== null;
}

/**
 * If the token immediately before `caret` is a reference, return its
 * [start, end) span in text coordinates. Otherwise null.
 */
export function findTrailingRef(text: string, caret: number): { start: number; end: number } | null {
  if (!text.startsWith('=')) return null;
  const body = text.slice(1);
  const tokens = tokenize(body);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i]!;
    if (tok.kind === 'eof') continue;
    // Convert to text coordinates (account for the leading '=').
    const start = tok.start + 1;
    const end = tok.end + 1;
    if (end !== caret) return null;
    if (tok.kind === 'ref' || tok.kind === 'range-ref') return { start, end };
    return null;
  }
  return null;
}

/**
 * Insert (or overwrite a trailing ref with) `refText` at the given caret.
 * Returns the new text and the caret position after the insertion.
 */
export function insertOrReplaceRef(
  text: string,
  caret: number,
  refText: string,
): { text: string; caret: number } {
  const trailing = findTrailingRef(text, caret);
  if (trailing) {
    const next = text.slice(0, trailing.start) + refText + text.slice(trailing.end);
    return { text: next, caret: trailing.start + refText.length };
  }
  const next = text.slice(0, caret) + refText + text.slice(caret);
  return { text: next, caret: caret + refText.length };
}
