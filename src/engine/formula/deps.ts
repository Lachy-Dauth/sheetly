/**
 * Walk an AST and collect every cell dependency (expanded per-cell for ranges).
 * Used by the runtime to build the dependency graph.
 */

import type { AstNode } from './ast';
import type { Workbook } from '../workbook';
import type { Address } from '../address';
import { resolveStructuredRange } from '../tables';

export interface Dependency {
  sheetId: string;
  address: Address;
}

const MAX_RANGE_EXPANSION = 100_000;

export function collectDependencies(
  ast: AstNode,
  workbook: Workbook,
  currentSheetId: string,
  currentCell?: Address,
): Dependency[] {
  const out: Dependency[] = [];
  visit(ast, workbook, currentSheetId, out, currentCell);
  return out;
}

function visit(
  node: AstNode,
  wb: Workbook,
  curSheet: string,
  out: Dependency[],
  curCell?: Address,
): void {
  switch (node.kind) {
    case 'literal':
    case 'name':
      return;
    case 'struct-ref': {
      let table = wb.tables.byNameCI(node.table);
      if (!table && node.table === '' && curCell) table = wb.tables.findAt(curSheet, curCell);
      if (!table) return;
      const range = resolveStructuredRange(table, node.specifier, curCell);
      if (!range) return;
      const size = (range.end.row - range.start.row + 1) * (range.end.col - range.start.col + 1);
      if (size > MAX_RANGE_EXPANSION) return;
      for (let row = range.start.row; row <= range.end.row; row++) {
        for (let col = range.start.col; col <= range.end.col; col++) {
          out.push({ sheetId: table.sheetId, address: { row, col } });
        }
      }
      return;
    }
    case 'ref': {
      const sheetId = node.sheet ? wb.sheetByName(node.sheet)?.id : curSheet;
      if (sheetId) out.push({ sheetId, address: node.address });
      return;
    }
    case 'range': {
      const sheetId = node.sheet ? wb.sheetByName(node.sheet)?.id : curSheet;
      if (!sheetId) return;
      const { start, end } = node.range;
      const size = (end.row - start.row + 1) * (end.col - start.col + 1);
      if (size > MAX_RANGE_EXPANSION) return;
      for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
          out.push({ sheetId, address: { row, col } });
        }
      }
      return;
    }
    case 'unary':
      visit(node.operand, wb, curSheet, out, curCell);
      return;
    case 'binary':
      visit(node.left, wb, curSheet, out, curCell);
      visit(node.right, wb, curSheet, out, curCell);
      return;
    case 'call':
      for (const arg of node.args) visit(arg, wb, curSheet, out, curCell);
      return;
    case 'array':
      for (const row of node.rows) for (const cell of row) visit(cell, wb, curSheet, out, curCell);
      return;
  }
}
