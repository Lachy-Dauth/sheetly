/**
 * Workbook: top-level container of sheets, named ranges, styles, and history.
 * Provides subscribe/notify hooks and the command-based mutation API.
 */

import type { Address, RangeAddress } from './address';
import type { Cell } from './cell';
import { Sheet } from './sheet';
import type { Command } from './commands';
import { StyleTable } from './styles';
import type { Style } from './styles';
import { FormulaRuntime } from './runtime';
import { parseInput } from './parse-input';

export interface NamedRange {
  name: string;
  ref: string; // e.g. "Sheet1!A1:B10"
  sheetId?: string;
}

type Listener = () => void;

export class Workbook {
  sheets: Sheet[] = [];
  namedRanges = new Map<string, NamedRange>();
  styles = new StyleTable();
  runtime: FormulaRuntime;

  private history: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<Listener>();
  private suspendNotify = 0;

  constructor() {
    this.runtime = new FormulaRuntime(this);
  }

  static createDefault(): Workbook {
    const wb = new Workbook();
    wb.apply({ kind: 'addSheet', name: 'Sheet1' });
    return wb;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private notify(): void {
    if (this.suspendNotify > 0) return;
    for (const l of this.listeners) l();
  }

  batch<T>(fn: () => T): T {
    this.suspendNotify++;
    try {
      return fn();
    } finally {
      this.suspendNotify--;
      this.notify();
    }
  }

  getSheet(id: string): Sheet {
    const s = this.sheets.find((s) => s.id === id);
    if (!s) throw new Error(`Unknown sheet id: ${id}`);
    return s;
  }

  sheetByName(name: string): Sheet | undefined {
    const lower = name.toLowerCase();
    return this.sheets.find((s) => s.name.toLowerCase() === lower);
  }

  uniqueSheetName(base = 'Sheet'): string {
    let i = this.sheets.length + 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const name = `${base}${i}`;
      if (!this.sheetByName(name)) return name;
      i++;
    }
  }

  /** Execute command, push to history (unless `asUndo`), return the command (with backfilled `prev`). */
  apply(cmd: Command, opts: { asUndo?: boolean; asRedo?: boolean } = {}): Command {
    const executed = this.execute(cmd);
    if (!opts.asUndo && !opts.asRedo) {
      this.history.push(executed);
      this.future.length = 0;
    } else if (opts.asUndo) {
      this.future.push(executed);
    } else if (opts.asRedo) {
      this.history.push(executed);
    }
    this.notify();
    return executed;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const cmd = this.history.pop();
    if (!cmd) return;
    const inverse = this.invert(cmd);
    this.apply(inverse, { asUndo: true });
  }

  redo(): void {
    const cmd = this.future.pop();
    if (!cmd) return;
    const inverse = this.invert(cmd);
    this.apply(inverse, { asRedo: true });
  }

  /** Convenience: set a cell from a raw user input string. */
  setCellFromInput(sheetId: string, address: Address, input: string): void {
    const sheet = this.getSheet(sheetId);
    const next = parseInput(input);
    const prev = sheet.getCell(address);
    if (!prev && !next) return; // both blank
    this.apply({ kind: 'setCell', sheetId, address, next, prev });
  }

  setStyle(sheetId: string, range: RangeAddress, patch: Partial<Style>): void {
    const sheet = this.getSheet(sheetId);
    const changes: Array<{ address: Address; next: Cell | undefined; prev: Cell | undefined }> = [];
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        const address = { row, col };
        const prev = sheet.getCell(address);
        const prevStyle = prev?.styleId !== undefined ? this.styles.get(prev.styleId) : {};
        const nextStyle: Style = { ...prevStyle, ...patch };
        const id = this.styles.intern(nextStyle);
        const next: Cell = { ...(prev ?? { raw: null }), styleId: id };
        changes.push({ address, next, prev });
      }
    }
    if (changes.length === 0) return;
    this.apply({ kind: 'setCells', sheetId, changes });
  }

  setName(name: string, ref: string): void {
    const prev = this.namedRanges.get(name)?.ref;
    this.apply({ kind: 'setName', name, ref, prev });
  }

  addSheet(name?: string): Sheet {
    const n = name ?? this.uniqueSheetName();
    const cmd = this.apply({ kind: 'addSheet', name: n });
    const id = (cmd as { sheetId?: string }).sheetId!;
    return this.getSheet(id);
  }

  // --- execution -------------------------------------------------------

  private execute(cmd: Command): Command {
    switch (cmd.kind) {
      case 'setCell': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = sheet.getCell(cmd.address);
        sheet.setCell(cmd.address, cmd.next);
        this.runtime.markDirty(cmd.sheetId, cmd.address);
        this.runtime.recalc();
        return { ...cmd, prev };
      }
      case 'setCells': {
        const sheet = this.getSheet(cmd.sheetId);
        const out = cmd.changes.map(({ address, next }) => {
          const prev = sheet.getCell(address);
          sheet.setCell(address, next);
          this.runtime.markDirty(cmd.sheetId, address);
          return { address, next, prev };
        });
        this.runtime.recalc();
        return { ...cmd, changes: out };
      }
      case 'resizeCol': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = sheet.setColWidth(cmd.col, cmd.width);
        return { ...cmd, prev };
      }
      case 'resizeRow': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = sheet.setRowHeight(cmd.row, cmd.height);
        return { ...cmd, prev };
      }
      case 'insertRows':
      case 'deleteRows':
      case 'insertCols':
      case 'deleteCols':
        return this.executeStructural(cmd);
      case 'addSheet': {
        const sheet = new Sheet(cmd.name, cmd.sheetId);
        const index = cmd.index ?? this.sheets.length;
        this.sheets.splice(index, 0, sheet);
        return { ...cmd, sheetId: sheet.id, index };
      }
      case 'removeSheet': {
        const index = this.sheets.findIndex((s) => s.id === cmd.sheetId);
        if (index < 0) return cmd;
        const [removed] = this.sheets.splice(index, 1);
        return { ...cmd, index, snapshot: removed };
      }
      case 'renameSheet': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = sheet.name;
        sheet.name = cmd.name;
        return { ...cmd, prev };
      }
      case 'merge': {
        const sheet = this.getSheet(cmd.sheetId);
        const merge = sheet.addMerge(cmd.range);
        return { ...cmd, id: merge.id };
      }
      case 'unmerge': {
        const sheet = this.getSheet(cmd.sheetId);
        const merge = sheet.merges.find((m) => m.id === cmd.mergeId);
        const range = merge?.range;
        if (merge) sheet.removeMerge(cmd.mergeId);
        return { ...cmd, range };
      }
      case 'setFreeze': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = { ...sheet.freeze };
        sheet.freeze = { rows: cmd.rows, cols: cmd.cols };
        return { ...cmd, prev };
      }
      case 'setSheetColor': {
        const sheet = this.getSheet(cmd.sheetId);
        const prev = sheet.color;
        sheet.color = cmd.color;
        return { ...cmd, prev };
      }
      case 'setName': {
        const prev = this.namedRanges.get(cmd.name)?.ref;
        this.namedRanges.set(cmd.name, { name: cmd.name, ref: cmd.ref });
        return { ...cmd, prev };
      }
      case 'composite': {
        const children = cmd.children.map((c) => this.execute(c));
        return { ...cmd, children };
      }
      default: {
        const _exhaustive: never = cmd;
        return _exhaustive;
      }
    }
  }

  private executeStructural(cmd: Command): Command {
    // Placeholder impl - structural editing is covered in later milestones.
    return cmd;
  }

  private invert(cmd: Command): Command {
    switch (cmd.kind) {
      case 'setCell':
        return { kind: 'setCell', sheetId: cmd.sheetId, address: cmd.address, next: cmd.prev };
      case 'setCells':
        return {
          kind: 'setCells',
          sheetId: cmd.sheetId,
          changes: cmd.changes.map((c) => ({ address: c.address, next: c.prev })),
        };
      case 'resizeCol':
        return {
          kind: 'resizeCol',
          sheetId: cmd.sheetId,
          col: cmd.col,
          width: cmd.prev ?? 96,
        };
      case 'resizeRow':
        return {
          kind: 'resizeRow',
          sheetId: cmd.sheetId,
          row: cmd.row,
          height: cmd.prev ?? 22,
        };
      case 'addSheet':
        return { kind: 'removeSheet', sheetId: cmd.sheetId! };
      case 'removeSheet': {
        // Re-add a snapshot; since we preserved the full Sheet object, splice it back.
        const sheet = cmd.snapshot as Sheet;
        const index = cmd.index ?? this.sheets.length;
        this.sheets.splice(index, 0, sheet);
        // Return a no-op to keep the history balanced; nothing more to do.
        return { kind: 'composite', label: 'restore-sheet', children: [] };
      }
      case 'renameSheet':
        return {
          kind: 'renameSheet',
          sheetId: cmd.sheetId,
          name: cmd.prev ?? cmd.name,
        };
      case 'merge':
        return { kind: 'unmerge', sheetId: cmd.sheetId, mergeId: cmd.id! };
      case 'unmerge':
        return { kind: 'merge', sheetId: cmd.sheetId, range: cmd.range! };
      case 'setFreeze':
        return {
          kind: 'setFreeze',
          sheetId: cmd.sheetId,
          rows: cmd.prev?.rows ?? 0,
          cols: cmd.prev?.cols ?? 0,
        };
      case 'setSheetColor':
        return { kind: 'setSheetColor', sheetId: cmd.sheetId, color: cmd.prev };
      case 'setName':
        return { kind: 'setName', name: cmd.name, ref: cmd.prev ?? '' };
      case 'composite':
        return {
          kind: 'composite',
          label: cmd.label,
          children: [...cmd.children].reverse().map((c) => this.invert(c)),
        };
      case 'insertRows':
      case 'deleteRows':
      case 'insertCols':
      case 'deleteCols':
        return cmd;
      default: {
        const _exhaustive: never = cmd;
        return _exhaustive;
      }
    }
  }
}
