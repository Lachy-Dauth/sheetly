/**
 * Per-sheet protection. When enabled, locked cells (the default) cannot be
 * edited, and formulas on "formulasHidden" cells are not shown in the bar.
 *
 * Per-cell "unlocked" state is stored on the Style (future work); for now we
 * treat every non-blank cell as locked when protection is on. A small allow-list
 * lets the author still edit specific ranges.
 */

import type { RangeAddress, Address } from './address';

export interface SheetProtection {
  enabled: boolean;
  /** Ranges that remain editable even while protection is on. */
  allowRanges?: RangeAddress[];
  /** Hide formula text in the formula bar. */
  hideFormulas?: boolean;
  /** Optional note shown when blocking an edit. */
  message?: string;
}

export function isAddressInRanges(a: Address, ranges: RangeAddress[] | undefined): boolean {
  if (!ranges) return false;
  for (const r of ranges) {
    if (
      a.row >= r.start.row &&
      a.row <= r.end.row &&
      a.col >= r.start.col &&
      a.col <= r.end.col
    ) {
      return true;
    }
  }
  return false;
}

export function isEditAllowed(p: SheetProtection | undefined, a: Address): boolean {
  if (!p || !p.enabled) return true;
  return isAddressInRanges(a, p.allowRanges);
}
