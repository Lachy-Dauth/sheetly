/**
 * Selection model: active cell, anchored range, plus non-contiguous secondary ranges.
 */

import type { Address, RangeAddress } from '../engine/address';
import { normalizeRange } from '../engine/address';

export interface Selection {
  active: Address;
  /** Primary range anchored to `anchor`; `end` is the latest mouse-up cell. */
  primary: { anchor: Address; end: Address };
  /** Additional ranges (Ctrl-click / Ctrl-drag). */
  extras: RangeAddress[];
}

export function cellSelection(a: Address): Selection {
  return { active: a, primary: { anchor: a, end: a }, extras: [] };
}

export function rangeSelection(anchor: Address, end: Address): Selection {
  return { active: anchor, primary: { anchor, end }, extras: [] };
}

export function primaryRange(sel: Selection): RangeAddress {
  return normalizeRange({ start: sel.primary.anchor, end: sel.primary.end });
}

export function allRanges(sel: Selection): RangeAddress[] {
  return [primaryRange(sel), ...sel.extras];
}

export function containsCell(sel: Selection, a: Address): boolean {
  for (const r of allRanges(sel)) {
    const n = normalizeRange(r);
    if (a.row >= n.start.row && a.row <= n.end.row && a.col >= n.start.col && a.col <= n.end.col) {
      return true;
    }
  }
  return false;
}

export function extendTo(sel: Selection, a: Address): Selection {
  return { active: a, primary: { anchor: sel.primary.anchor, end: a }, extras: sel.extras };
}

export function addExtraRange(sel: Selection, r: RangeAddress): Selection {
  return { ...sel, extras: [...sel.extras, normalizeRange(r)] };
}

export function moveActive(_sel: Selection, a: Address): Selection {
  return cellSelection(a);
}
