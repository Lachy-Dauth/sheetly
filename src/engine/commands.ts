/**
 * Command pattern: every mutation is a reversible op. Used by Workbook for
 * undo/redo. Commands should be self-contained and not hold external refs.
 */

import type { Address, RangeAddress } from './address';
import type { Cell } from './cell';

export type CommandKind =
  | 'setCell'
  | 'setCells'
  | 'resizeCol'
  | 'resizeRow'
  | 'insertRows'
  | 'deleteRows'
  | 'insertCols'
  | 'deleteCols'
  | 'addSheet'
  | 'removeSheet'
  | 'renameSheet'
  | 'setStyle'
  | 'merge'
  | 'unmerge'
  | 'setFreeze'
  | 'setSheetColor'
  | 'setName'
  | 'composite';

export interface SetCellCmd {
  kind: 'setCell';
  sheetId: string;
  address: Address;
  next: Cell | undefined;
  prev?: Cell | undefined;
}

export interface SetCellsCmd {
  kind: 'setCells';
  sheetId: string;
  changes: Array<{ address: Address; next: Cell | undefined; prev?: Cell | undefined }>;
}

export interface ResizeColCmd {
  kind: 'resizeCol';
  sheetId: string;
  col: number;
  width: number;
  prev?: number;
}

export interface ResizeRowCmd {
  kind: 'resizeRow';
  sheetId: string;
  row: number;
  height: number;
  prev?: number;
}

export interface InsertRowsCmd {
  kind: 'insertRows';
  sheetId: string;
  at: number;
  count: number;
}

export interface DeleteRowsCmd {
  kind: 'deleteRows';
  sheetId: string;
  at: number;
  count: number;
  removed?: Array<{ address: Address; cell: Cell }>;
}

export interface InsertColsCmd {
  kind: 'insertCols';
  sheetId: string;
  at: number;
  count: number;
}

export interface DeleteColsCmd {
  kind: 'deleteCols';
  sheetId: string;
  at: number;
  count: number;
  removed?: Array<{ address: Address; cell: Cell }>;
}

export interface AddSheetCmd {
  kind: 'addSheet';
  name: string;
  sheetId?: string;
  index?: number;
}

export interface RemoveSheetCmd {
  kind: 'removeSheet';
  sheetId: string;
  index?: number;
  snapshot?: unknown;
}

export interface RenameSheetCmd {
  kind: 'renameSheet';
  sheetId: string;
  name: string;
  prev?: string;
}

export interface MergeCmd {
  kind: 'merge';
  sheetId: string;
  range: RangeAddress;
  id?: number;
}

export interface UnmergeCmd {
  kind: 'unmerge';
  sheetId: string;
  mergeId: number;
  range?: RangeAddress;
}

export interface SetFreezeCmd {
  kind: 'setFreeze';
  sheetId: string;
  rows: number;
  cols: number;
  prev?: { rows: number; cols: number };
}

export interface SetSheetColorCmd {
  kind: 'setSheetColor';
  sheetId: string;
  color?: string;
  prev?: string;
}

export interface SetNameCmd {
  kind: 'setName';
  name: string;
  ref: string;
  prev?: string;
}

export interface CompositeCmd {
  kind: 'composite';
  label: string;
  children: Command[];
}

export type Command =
  | SetCellCmd
  | SetCellsCmd
  | ResizeColCmd
  | ResizeRowCmd
  | InsertRowsCmd
  | DeleteRowsCmd
  | InsertColsCmd
  | DeleteColsCmd
  | AddSheetCmd
  | RemoveSheetCmd
  | RenameSheetCmd
  | MergeCmd
  | UnmergeCmd
  | SetFreezeCmd
  | SetSheetColorCmd
  | SetNameCmd
  | CompositeCmd;
