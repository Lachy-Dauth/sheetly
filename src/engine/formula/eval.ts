/**
 * Placeholder for M3. Returns #NAME? until the real evaluator lands.
 */

import type { Workbook } from '../workbook';
import type { Address } from '../address';
import type { Scalar } from '../cell';
import { makeError } from '../cell';

export function evaluateFormula(
  _source: string,
  _workbook: Workbook,
  _sheetId: string,
  _cell: Address,
): Scalar {
  return makeError('#NAME?', 'formula engine not yet implemented');
}
