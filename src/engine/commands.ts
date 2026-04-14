/**
 * Command pattern: every mutation is a reversible op. Used by Workbook for
 * undo/redo. Commands should be self-contained and not hold external refs.
 */

import type { Address, RangeAddress } from './address';
import type { Cell } from './cell';
import type { Table } from './tables';
import type { ConditionalRule } from './conditional';
import type { Validation } from './validation';
import type { Chart } from './charts';
import type { Pivot } from './pivots';
import type { Comment, CommentReply } from './comments';
import type { SheetProtection } from './protection';

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
  | 'addTable'
  | 'removeTable'
  | 'updateTable'
  | 'addCfRule'
  | 'removeCfRule'
  | 'updateCfRule'
  | 'addValidation'
  | 'removeValidation'
  | 'addChart'
  | 'removeChart'
  | 'updateChart'
  | 'addPivot'
  | 'removePivot'
  | 'updatePivot'
  | 'addComment'
  | 'removeComment'
  | 'updateComment'
  | 'addCommentReply'
  | 'removeCommentReply'
  | 'setProtection'
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

export interface RemoveNameCmd {
  kind: 'removeName';
  name: string;
  prev?: string;
}

export interface AddTableCmd {
  kind: 'addTable';
  table: Table;
}

export interface RemoveTableCmd {
  kind: 'removeTable';
  tableId: string;
  snapshot?: Table;
}

export interface UpdateTableCmd {
  kind: 'updateTable';
  tableId: string;
  patch: Partial<Table>;
  prev?: Partial<Table>;
}

export interface AddCfRuleCmd {
  kind: 'addCfRule';
  sheetId: string;
  rule: ConditionalRule;
}

export interface RemoveCfRuleCmd {
  kind: 'removeCfRule';
  sheetId: string;
  ruleId: string;
  snapshot?: ConditionalRule;
  index?: number;
}

export interface UpdateCfRuleCmd {
  kind: 'updateCfRule';
  sheetId: string;
  ruleId: string;
  patch: Partial<ConditionalRule>;
  prev?: Partial<ConditionalRule>;
}

export interface AddValidationCmd {
  kind: 'addValidation';
  sheetId: string;
  validation: Validation;
}

export interface RemoveValidationCmd {
  kind: 'removeValidation';
  sheetId: string;
  validationId: string;
  snapshot?: Validation;
  index?: number;
}

export interface AddChartCmd {
  kind: 'addChart';
  chart: Chart;
}

export interface RemoveChartCmd {
  kind: 'removeChart';
  sheetId: string;
  chartId: string;
  snapshot?: Chart;
  index?: number;
}

export interface UpdateChartCmd {
  kind: 'updateChart';
  chartId: string;
  patch: Partial<Chart>;
  prev?: Partial<Chart>;
}

export interface AddPivotCmd {
  kind: 'addPivot';
  pivot: Pivot;
}

export interface RemovePivotCmd {
  kind: 'removePivot';
  pivotId: string;
  snapshot?: Pivot;
}

export interface UpdatePivotCmd {
  kind: 'updatePivot';
  pivotId: string;
  patch: Partial<Pivot>;
  prev?: Partial<Pivot>;
}

export interface AddCommentCmd {
  kind: 'addComment';
  comment: Comment;
}

export interface RemoveCommentCmd {
  kind: 'removeComment';
  commentId: string;
  snapshot?: Comment;
}

export interface UpdateCommentCmd {
  kind: 'updateComment';
  commentId: string;
  patch: Partial<Comment>;
  prev?: Partial<Comment>;
}

export interface AddCommentReplyCmd {
  kind: 'addCommentReply';
  commentId: string;
  reply: CommentReply;
}

export interface RemoveCommentReplyCmd {
  kind: 'removeCommentReply';
  commentId: string;
  replyId: string;
  snapshot?: CommentReply;
  index?: number;
}

export interface SetProtectionCmd {
  kind: 'setProtection';
  sheetId: string;
  protection?: SheetProtection;
  prev?: SheetProtection;
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
  | RemoveNameCmd
  | AddTableCmd
  | RemoveTableCmd
  | UpdateTableCmd
  | AddCfRuleCmd
  | RemoveCfRuleCmd
  | UpdateCfRuleCmd
  | AddValidationCmd
  | RemoveValidationCmd
  | AddChartCmd
  | RemoveChartCmd
  | UpdateChartCmd
  | AddPivotCmd
  | RemovePivotCmd
  | UpdatePivotCmd
  | AddCommentCmd
  | RemoveCommentCmd
  | UpdateCommentCmd
  | AddCommentReplyCmd
  | RemoveCommentReplyCmd
  | SetProtectionCmd
  | CompositeCmd;
