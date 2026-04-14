/**
 * Canvas-virtualised grid. Handles mouse + keyboard interaction, scrolling,
 * resize, and cell editing. Delegates painting to ./draw and layout to ./layout.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address, RangeAddress } from '../engine/address';
import { isFormula } from '../engine/cell';
import { drawGrid, cellRect } from './draw';
import { measureColumnWidth } from './draw-cells';
import type { ThemeId } from './theme';
import { THEMES } from './theme';
import {
  HEADER_H,
  HEADER_W,
  colAt,
  columnX,
  computeVisible,
  rowAt,
  rowY,
  totalHeight,
  totalWidth,
} from './layout';
import type { Selection } from './selection';
import { cellSelection, extendTo, primaryRange } from './selection';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address; // legacy prop: active cell
  onSelectionChange: (a: Address) => void;
  onRangeChange?: (range: RangeAddress) => void;
  onDropFiles: (files: File[]) => void;
  themeId?: ThemeId;
  /** If set, next click applies this styleId to the target (format painter). */
  paintStyleId?: number | null;
  onPaintComplete?: () => void;
}

type DragMode = null | 'select' | 'resize-col' | 'resize-row';

export function Grid(props: Props) {
  const {
    workbook,
    sheet,
    onSelectionChange,
    onRangeChange,
    onDropFiles,
    themeId = 'light',
    paintStyleId,
    onPaintComplete,
  } = props;
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [sel, setSel] = useState<Selection>(() => cellSelection(props.selection));
  const [editing, setEditing] = useState<{ a: Address; value: string } | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startCol?: number;
    startRow?: number;
    origin?: number;
    baseSize?: number;
  }>({
    mode: null,
  });

  // Keep external "active cell" in sync.
  useEffect(() => {
    onSelectionChange(sel.active);
  }, [sel.active.row, sel.active.col, onSelectionChange]);

  // Notify parent of the current primary range.
  useEffect(() => {
    if (!onRangeChange) return;
    onRangeChange(primaryRange(sel));
  }, [sel.primary.anchor.row, sel.primary.anchor.col, sel.primary.end.row, sel.primary.end.col, onRangeChange]);

  // Size observer.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]!.contentRect;
      setViewport({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw on any dependent state change.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const visible = computeVisible(sheet, { ...viewport, scrollX: scroll.x, scrollY: scroll.y });
    drawGrid({
      ctx,
      workbook,
      sheet,
      viewport: { ...viewport, scrollX: scroll.x, scrollY: scroll.y },
      visible,
      selection: sel,
      theme: THEMES[themeId],
      dpr,
    });
  }, [workbook, sheet, viewport, scroll.x, scroll.y, sel, themeId]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => workbook.subscribe(draw), [workbook, draw]);

  // --- hit testing -----------------------------------------------------

  const hitTest = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < HEADER_W && y < HEADER_H) return { zone: 'corner' as const };
    if (y < HEADER_H) {
      const { col, endX } = colAt(sheet, x - HEADER_W + scroll.x);
      const onHandle = Math.abs(x - HEADER_W - (endX - scroll.x)) < 4;
      return { zone: 'col-header' as const, col, onHandle };
    }
    if (x < HEADER_W) {
      const { row, endY } = rowAt(sheet, y - HEADER_H + scroll.y);
      const onHandle = Math.abs(y - HEADER_H - (endY - scroll.y)) < 4;
      return { zone: 'row-header' as const, row, onHandle };
    }
    const { col } = colAt(sheet, x - HEADER_W + scroll.x);
    const { row } = rowAt(sheet, y - HEADER_H + scroll.y);
    return { zone: 'cell' as const, row, col, x, y };
  };

  // --- scrolling -------------------------------------------------------

  const onWheel = (e: React.WheelEvent) => {
    const dx = e.deltaX;
    const dy = e.deltaY;
    const maxX = Math.max(0, totalWidth(sheet) - (viewport.width - HEADER_W));
    const maxY = Math.max(0, totalHeight(sheet) - (viewport.height - HEADER_H));
    setScroll((s) => ({
      x: Math.max(0, Math.min(maxX, s.x + dx)),
      y: Math.max(0, Math.min(maxY, s.y + dy)),
    }));
  };

  // --- mouse -----------------------------------------------------------

  const applyPaint = (range: { start: Address; end: Address }) => {
    if (paintStyleId == null) return;
    const style = workbook.styles.get(paintStyleId);
    workbook.setStyle(sheet.id, range, style);
    onPaintComplete?.();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit.zone === 'col-header' && hit.onHandle) {
      dragRef.current = {
        mode: 'resize-col',
        startCol: hit.col,
        origin: e.clientX,
        baseSize: sheet.colWidth(hit.col),
      };
      return;
    }
    if (hit.zone === 'row-header' && hit.onHandle) {
      dragRef.current = {
        mode: 'resize-row',
        startRow: hit.row,
        origin: e.clientY,
        baseSize: sheet.rowHeight(hit.row),
      };
      return;
    }
    if (hit.zone === 'col-header') {
      const top = { row: 0, col: hit.col };
      const bottom = { row: sheet.rowCount - 1, col: hit.col };
      setSel({ active: top, primary: { anchor: top, end: bottom }, extras: [] });
      dragRef.current = { mode: 'select' };
      if (paintStyleId != null) applyPaint({ start: top, end: bottom });
      return;
    }
    if (hit.zone === 'row-header') {
      const left = { row: hit.row, col: 0 };
      const right = { row: hit.row, col: sheet.colCount - 1 };
      setSel({ active: left, primary: { anchor: left, end: right }, extras: [] });
      dragRef.current = { mode: 'select' };
      if (paintStyleId != null) applyPaint({ start: left, end: right });
      return;
    }
    if (hit.zone === 'cell') {
      const a = { row: hit.row, col: hit.col };
      if (e.shiftKey) {
        setSel((prev) => extendTo(prev, a));
      } else {
        setSel(cellSelection(a));
      }
      dragRef.current = { mode: 'select' };
      setEditing(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (
      drag.mode === 'resize-col' &&
      drag.startCol !== undefined &&
      drag.origin !== undefined &&
      drag.baseSize !== undefined
    ) {
      const delta = e.clientX - drag.origin;
      const width = Math.max(16, drag.baseSize + delta);
      sheet.setColWidth(drag.startCol, width);
      draw();
    } else if (
      drag.mode === 'resize-row' &&
      drag.startRow !== undefined &&
      drag.origin !== undefined &&
      drag.baseSize !== undefined
    ) {
      const delta = e.clientY - drag.origin;
      const height = Math.max(8, drag.baseSize + delta);
      sheet.setRowHeight(drag.startRow, height);
      draw();
    } else if (drag.mode === 'select') {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit.zone === 'cell') {
        setSel((prev) => extendTo(prev, { row: hit.row, col: hit.col }));
      }
    } else {
      // Cursor feedback
      const hit = hitTest(e.clientX, e.clientY);
      const canvas = canvasRef.current!;
      if ((hit.zone === 'col-header' && hit.onHandle) || (hit.zone === 'row-header' && hit.onHandle)) {
        canvas.style.cursor = hit.zone === 'col-header' ? 'col-resize' : 'row-resize';
      } else if (paintStyleId != null) {
        canvas.style.cursor = 'copy';
      } else {
        canvas.style.cursor = 'cell';
      }
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (
      drag.mode === 'resize-col' &&
      drag.startCol !== undefined &&
      drag.origin !== undefined &&
      drag.baseSize !== undefined
    ) {
      const delta = e.clientX - drag.origin;
      const finalWidth = Math.max(16, drag.baseSize + delta);
      // Restore the pre-drag width, then apply via command so undo has the right prev.
      sheet.setColWidth(drag.startCol, drag.baseSize);
      workbook.apply({
        kind: 'resizeCol',
        sheetId: sheet.id,
        col: drag.startCol,
        width: finalWidth,
      });
    }
    if (
      drag.mode === 'resize-row' &&
      drag.startRow !== undefined &&
      drag.origin !== undefined &&
      drag.baseSize !== undefined
    ) {
      const delta = e.clientY - drag.origin;
      const finalHeight = Math.max(8, drag.baseSize + delta);
      sheet.setRowHeight(drag.startRow, drag.baseSize);
      workbook.apply({
        kind: 'resizeRow',
        sheetId: sheet.id,
        row: drag.startRow,
        height: finalHeight,
      });
    }
    if (drag.mode === 'select' && paintStyleId != null) {
      applyPaint(primaryRange(sel));
    }
    dragRef.current = { mode: null };
  };

  const onDblClick = (e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit.zone === 'col-header' && hit.onHandle) {
      // Autofit the column whose right edge was double-clicked.
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const width = measureColumnWidth(sheet, workbook, hit.col, ctx);
        workbook.apply({ kind: 'resizeCol', sheetId: sheet.id, col: hit.col, width });
      }
      return;
    }
    if (hit.zone === 'cell') openEditor({ row: hit.row, col: hit.col });
  };

  // --- keyboard --------------------------------------------------------

  const moveSel = (dr: number, dc: number, extend: boolean) => {
    setSel((prev) => {
      const next: Address = {
        row: Math.max(0, Math.min(sheet.rowCount - 1, (extend ? prev.primary.end.row : prev.active.row) + dr)),
        col: Math.max(0, Math.min(sheet.colCount - 1, (extend ? prev.primary.end.col : prev.active.col) + dc)),
      };
      return extend ? extendTo(prev, next) : cellSelection(next);
    });
  };

  const openEditor = (a: Address, initial?: string) => {
    const cell = sheet.getCell(a);
    const text =
      initial ??
      (cell
        ? isFormula(cell.raw)
          ? (cell.raw as string)
          : cell.raw === null
            ? ''
            : String(cell.raw)
        : '');
    setEditing({ a, value: text });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const metaOrCtrl = e.metaKey || e.ctrlKey;
    if (metaOrCtrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      workbook.undo();
      return;
    }
    if (metaOrCtrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      workbook.redo();
      return;
    }
    if (metaOrCtrl && e.key === 'Home') {
      setSel(cellSelection({ row: 0, col: 0 }));
      e.preventDefault();
      return;
    }
    if (metaOrCtrl && e.key === 'End') {
      setSel(cellSelection({ row: sheet.maxRow, col: sheet.maxCol }));
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'ArrowUp':
        moveSel(metaOrCtrl ? -jumpRow(sheet, sel.active, -1) : -1, 0, e.shiftKey);
        e.preventDefault();
        break;
      case 'ArrowDown':
        moveSel(metaOrCtrl ? jumpRow(sheet, sel.active, 1) : 1, 0, e.shiftKey);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        moveSel(0, metaOrCtrl ? -jumpCol(sheet, sel.active, -1) : -1, e.shiftKey);
        e.preventDefault();
        break;
      case 'ArrowRight':
        moveSel(0, metaOrCtrl ? jumpCol(sheet, sel.active, 1) : 1, e.shiftKey);
        e.preventDefault();
        break;
      case 'Enter':
        if (e.shiftKey) moveSel(-1, 0, false);
        else moveSel(1, 0, false);
        e.preventDefault();
        break;
      case 'Tab':
        moveSel(0, e.shiftKey ? -1 : 1, false);
        e.preventDefault();
        break;
      case 'Escape':
        if (paintStyleId != null) onPaintComplete?.();
        e.preventDefault();
        break;
      case 'F2':
        openEditor(sel.active);
        e.preventDefault();
        break;
      case 'Delete':
      case 'Backspace':
        workbook.setCellFromInput(sheet.id, sel.active, '');
        for (let r = primaryRange(sel).start.row; r <= primaryRange(sel).end.row; r++) {
          for (let c = primaryRange(sel).start.col; c <= primaryRange(sel).end.col; c++) {
            if (r !== sel.active.row || c !== sel.active.col) {
              workbook.setCellFromInput(sheet.id, { row: r, col: c }, '');
            }
          }
        }
        e.preventDefault();
        break;
      default:
        if (e.key.length === 1 && !metaOrCtrl) {
          openEditor(sel.active, e.key);
          e.preventDefault();
        }
    }
    // Active-cell auto-scroll is handled by the effect below, which observes the
    // committed state. Calling scrollIntoView inline here would use the stale
    // `sel` (setSel is async), so the viewport would lag one keystroke behind.
  };

  const scrollIntoView = useCallback(
    (a: Address) => {
      const x = columnX(sheet, a.col);
      const w = sheet.colWidth(a.col);
      const y = rowY(sheet, a.row);
      const h = sheet.rowHeight(a.row);
      setScroll((s) => {
        let sx = s.x;
        let sy = s.y;
        const vw = viewport.width - HEADER_W;
        const vh = viewport.height - HEADER_H;
        if (x < sx) sx = x;
        else if (x + w > sx + vw) sx = x + w - vw;
        if (y < sy) sy = y;
        else if (y + h > sy + vh) sy = y + h - vh;
        if (sx === s.x && sy === s.y) return s;
        return { x: sx, y: sy };
      });
    },
    [sheet, viewport.width, viewport.height],
  );

  useEffect(() => {
    scrollIntoView(sel.active);
    // Only scroll when the active cell changes. viewport resizes are intentionally
    // ignored so resizing the window doesn't fight the user's scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.active.row, sel.active.col]);

  // --- cell editor overlay --------------------------------------------

  const editorPos = editing
    ? cellRect(
        sheet,
        computeVisible(sheet, { ...viewport, scrollX: scroll.x, scrollY: scroll.y }),
        editing.a.row,
        editing.a.col,
        editing.a.row,
        editing.a.col,
      )
    : undefined;

  return (
    <div
      ref={outerRef}
      className="grid-container"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDblClick}
      />
      {editing && editorPos && (
        <input
          autoFocus
          className="cell-editor"
          style={{
            left: editorPos.x,
            top: editorPos.y,
            width: editorPos.w,
            height: editorPos.h,
          }}
          value={editing.value}
          onChange={(e) => setEditing({ a: editing.a, value: e.target.value })}
          onBlur={() => {
            workbook.setCellFromInput(sheet.id, editing.a, editing.value);
            setEditing(null);
            outerRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              workbook.setCellFromInput(sheet.id, editing.a, editing.value);
              setEditing(null);
              outerRef.current?.focus();
              moveSel(e.shiftKey ? -1 : 1, 0, false);
              e.preventDefault();
            } else if (e.key === 'Tab') {
              workbook.setCellFromInput(sheet.id, editing.a, editing.value);
              setEditing(null);
              outerRef.current?.focus();
              moveSel(0, e.shiftKey ? -1 : 1, false);
              e.preventDefault();
            } else if (e.key === 'Escape') {
              setEditing(null);
              outerRef.current?.focus();
              e.preventDefault();
            }
          }}
        />
      )}
    </div>
  );
}

function jumpRow(sheet: Sheet, a: { row: number; col: number }, dir: 1 | -1): number {
  let r = a.row + dir;
  while (r >= 0 && r < sheet.rowCount) {
    if (sheet.getCell({ row: r, col: a.col })) return Math.abs(r - a.row);
    r += dir;
  }
  return dir === 1 ? sheet.rowCount - 1 - a.row : a.row;
}

function jumpCol(sheet: Sheet, a: { row: number; col: number }, dir: 1 | -1): number {
  let c = a.col + dir;
  while (c >= 0 && c < sheet.colCount) {
    if (sheet.getCell({ row: a.row, col: c })) return Math.abs(c - a.col);
    c += dir;
  }
  return dir === 1 ? sheet.colCount - 1 - a.col : a.col;
}
