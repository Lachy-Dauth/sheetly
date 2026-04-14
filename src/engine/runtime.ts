/**
 * Formula runtime: dependency graph, dirty tracking, topological recalc.
 * The evaluator itself lives in `./formula/eval.ts` once M3 lands.
 */

import type { Address } from './address';
import { cellKey } from './address';
import type { Scalar } from './cell';
import { isErrorValue, makeError } from './cell';
import type { Workbook } from './workbook';
import { evaluateFormula } from './formula/eval';
import { parseFormula } from './formula/parse';
import { collectDependencies } from './formula/deps';

type DepKey = string; // `${sheetId}:${row},${col}`

function keyOf(sheetId: string, a: Address): DepKey {
  return `${sheetId}:${a.row},${a.col}`;
}

export class FormulaRuntime {
  private dependents = new Map<DepKey, Set<DepKey>>();
  private precedents = new Map<DepKey, Set<DepKey>>();
  private dirty = new Set<DepKey>();
  private iterative = false;
  private maxIterations = 100;
  private tolerance = 0.001;

  constructor(public workbook: Workbook) {}

  setIterative(on: boolean, maxIter = 100, tol = 0.001): void {
    this.iterative = on;
    this.maxIterations = maxIter;
    this.tolerance = tol;
  }

  /** Mark a cell as dirty, plus anything that depends on it transitively. */
  markDirty(sheetId: string, address: Address): void {
    const k = keyOf(sheetId, address);
    const queue = [k];
    while (queue.length) {
      const cur = queue.pop()!;
      if (this.dirty.has(cur)) continue;
      this.dirty.add(cur);
      const downstream = this.dependents.get(cur);
      if (downstream) for (const d of downstream) queue.push(d);
    }
  }

  /** Mark every formula cell in the workbook dirty (e.g. on load). */
  markAllFormulasDirty(): void {
    for (const sheet of this.workbook.sheets) {
      for (const [key, cell] of sheet.cells) {
        if (typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
          const row = Math.floor(key / 16384);
          const col = key % 16384;
          this.dirty.add(keyOf(sheet.id, { row, col }));
        }
      }
    }
  }

  recalc(): void {
    if (this.dirty.size === 0) return;
    // Build subgraph of dirty nodes and do Kahn's algorithm.
    const toProcess = new Set(this.dirty);
    this.dirty.clear();

    // Refresh precedents for each dirty formula cell.
    for (const k of toProcess) {
      this.refreshPrecedents(k);
    }

    // Topological sort: repeatedly pick nodes whose precedents in `toProcess` are empty.
    const indegree = new Map<DepKey, number>();
    for (const k of toProcess) {
      let count = 0;
      const pre = this.precedents.get(k);
      if (pre) for (const p of pre) if (toProcess.has(p)) count++;
      indegree.set(k, count);
    }

    const queue: DepKey[] = [];
    for (const [k, d] of indegree) if (d === 0) queue.push(k);
    const order: DepKey[] = [];
    while (queue.length) {
      const k = queue.shift()!;
      order.push(k);
      const downs = this.dependents.get(k);
      if (downs) {
        for (const d of downs) {
          if (!toProcess.has(d)) continue;
          const v = (indegree.get(d) ?? 0) - 1;
          indegree.set(d, v);
          if (v === 0) queue.push(d);
        }
      }
    }

    // Cycles: remaining nodes => either iterate or mark as #CIRC!.
    const remaining = new Set<DepKey>();
    for (const [k, d] of indegree) if (d > 0) remaining.add(k);

    for (const k of order) this.evaluateKey(k);

    if (remaining.size > 0) {
      if (this.iterative) {
        for (let i = 0; i < this.maxIterations; i++) {
          let maxDelta = 0;
          for (const k of remaining) {
            const prev = this.currentValue(k);
            this.evaluateKey(k);
            const next = this.currentValue(k);
            const d = numericDelta(prev, next);
            if (d > maxDelta) maxDelta = d;
          }
          if (maxDelta < this.tolerance) break;
        }
      } else {
        for (const k of remaining) {
          const { sheetId, row, col } = splitKey(k);
          const sheet = this.workbook.getSheet(sheetId);
          const cell = sheet.getCell({ row, col });
          if (cell) {
            cell.computed = makeError('#CIRC!');
          }
        }
      }
    }
  }

  private refreshPrecedents(k: DepKey): void {
    const { sheetId, row, col } = splitKey(k);
    const sheet = this.workbook.getSheet(sheetId);
    const cell = sheet.cells.get(cellKey(row, col));

    // Clear old precedents / remove self from their dependents lists.
    const oldPre = this.precedents.get(k);
    if (oldPre) {
      for (const p of oldPre) this.dependents.get(p)?.delete(k);
    }
    this.precedents.set(k, new Set());

    if (!cell || typeof cell.raw !== 'string' || !cell.raw.startsWith('=')) return;
    const parsed = parseFormula(cell.raw.slice(1));
    if (!parsed.ok) return;
    const deps = collectDependencies(parsed.ast, this.workbook, sheetId);
    const pre = new Set<DepKey>();
    for (const dep of deps) {
      const depKey = keyOf(dep.sheetId, dep.address);
      pre.add(depKey);
      let list = this.dependents.get(depKey);
      if (!list) this.dependents.set(depKey, (list = new Set()));
      list.add(k);
    }
    this.precedents.set(k, pre);
  }

  private evaluateKey(k: DepKey): void {
    const { sheetId, row, col } = splitKey(k);
    const sheet = this.workbook.getSheet(sheetId);
    const cell = sheet.cells.get(cellKey(row, col));
    if (!cell) return;
    if (typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
      const res = evaluateFormula(cell.raw.slice(1), this.workbook, sheetId, { row, col });
      cell.computed = res;
    } else {
      cell.computed = undefined;
    }
  }

  private currentValue(k: DepKey): Scalar | undefined {
    const { sheetId, row, col } = splitKey(k);
    const sheet = this.workbook.getSheet(sheetId);
    const cell = sheet.cells.get(cellKey(row, col));
    if (!cell) return null;
    return cell.computed ?? cell.value ?? null;
  }
}

function splitKey(k: DepKey): { sheetId: string; row: number; col: number } {
  const colonIdx = k.indexOf(':');
  const sheetId = k.slice(0, colonIdx);
  const rest = k.slice(colonIdx + 1);
  const commaIdx = rest.indexOf(',');
  return {
    sheetId,
    row: parseInt(rest.slice(0, commaIdx), 10),
    col: parseInt(rest.slice(commaIdx + 1), 10),
  };
}

function numericDelta(a: Scalar | undefined, b: Scalar | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (a === b) return 0;
  if (isErrorValue(a) || isErrorValue(b)) return 0;
  return Infinity;
}
