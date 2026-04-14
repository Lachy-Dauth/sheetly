/**
 * Cell value types, error codes, and basic coercions.
 */

export type CellError =
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#N/A'
  | '#NUM!'
  | '#NULL!'
  | '#CIRC!';

export const CELL_ERRORS: readonly CellError[] = [
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#NULL!',
  '#CIRC!',
];

export interface ErrorValue {
  kind: 'error';
  code: CellError;
  message?: string;
}

export function isErrorValue(v: unknown): v is ErrorValue {
  return typeof v === 'object' && v !== null && (v as ErrorValue).kind === 'error';
}

export function makeError(code: CellError, message?: string): ErrorValue {
  return { kind: 'error', code, message };
}

/** Values that can be stored or produced. `null` = blank. */
export type Scalar = number | string | boolean | ErrorValue | null;

/** A 2D spilled array (for dynamic arrays). */
export type ArrayValue = Scalar[][];

export type Value = Scalar | ArrayValue;

export interface Cell {
  /** Raw user input. Numbers/booleans stored as their native type; formulas as a string starting with '='. */
  raw: string | number | boolean | null;
  /** Cached parsed input value (for non-formula cells). */
  value?: Scalar;
  /** Cached computed value (for formula cells). */
  computed?: Scalar;
  /** If this cell is the anchor of a spill, the full array. */
  spill?: ArrayValue;
  /** Style reference id into the workbook style table. */
  styleId?: number;
  /** Optional display number format override (when no styleId). */
  format?: string;
  /** Comment text. */
  comment?: string;
  /** Data validation id. */
  validationId?: number;
}

export function isFormula(raw: Cell['raw']): raw is string {
  return typeof raw === 'string' && raw.startsWith('=');
}

export function isBlankCell(cell: Cell | undefined): boolean {
  if (!cell) return true;
  return cell.raw === null || cell.raw === '';
}

/** Coerce a scalar to a finite number, or return an ErrorValue. */
export function toNumber(v: Scalar): number | ErrorValue {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErrorValue(v)) return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return makeError('#VALUE!');
}

export function toBool(v: Scalar): boolean | ErrorValue {
  if (v === null || v === '') return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErrorValue(v)) return v;
  const s = String(v).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return makeError('#VALUE!');
}

export function toText(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErrorValue(v)) return v.code;
  return String(v);
}
