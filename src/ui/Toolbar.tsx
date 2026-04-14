import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address } from '../engine/address';
import type { Style } from '../engine/styles';
import { NUMBER_FORMATS } from '../engine/number-formats';
import { primaryRange } from '../grid/selection';
import { sortRange, dedupeRange, textToColumns } from '../engine/data-ops';
import { BorderMenu } from './BorderMenu';
import { ConditionalMenu } from './ConditionalMenu';
import { DataMenu } from './DataMenu';
import { ChartMenu } from './ChartMenu';
import { PivotMenu } from './PivotMenu';
import type { ThemeId } from '../grid/theme';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address;
  selectionRange?: { start: Address; end: Address };
  themeId: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  onStartPainter: (styleId: number) => void;
  painterActive: boolean;
  onImport: () => void;
  onFind: () => void;
  onToggleCharts: () => void;
  onTogglePivots: () => void;
  onOpenPivots: () => void;
}

export function Toolbar(props: Props) {
  const {
    workbook,
    sheet,
    selection,
    selectionRange,
    themeId,
    onThemeChange,
    onStartPainter,
    painterActive,
    onImport,
    onFind,
    onToggleCharts,
    onTogglePivots,
    onOpenPivots,
  } = props;

  const activeRange = selectionRange ?? { start: selection, end: selection };
  const apply = (patch: Partial<Style>) => {
    workbook.setStyle(sheet.id, activeRange, patch);
  };

  const currentCell = sheet.getCell(selection);
  const currentStyle: Style =
    currentCell?.styleId !== undefined ? workbook.styles.get(currentCell.styleId) : {};

  const hasMergeAtActive = !!sheet.findMergeAt(selection);

  const toggleMerge = () => {
    if (hasMergeAtActive) {
      workbook.unmergeAt(sheet.id, selection);
    } else {
      const r = primaryRange({
        active: selection,
        primary: { anchor: activeRange.start, end: activeRange.end },
        extras: [],
      });
      workbook.mergeRange(sheet.id, r);
    }
  };

  const startPainter = () => {
    if (currentCell?.styleId !== undefined) onStartPainter(currentCell.styleId);
  };

  return (
    <div className="toolbar" role="toolbar">
      <div className="group">
        <button onClick={() => workbook.undo()} disabled={!workbook.canUndo()} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button onClick={() => workbook.redo()} disabled={!workbook.canRedo()} title="Redo (Ctrl+Y)">
          ↷
        </button>
      </div>
      <div className="group">
        <button onClick={onImport} title="Import CSV / TSV">
          Import
        </button>
        <button
          onClick={() => {
            import('../io/csv').then((m) => m.exportCsv(sheet));
          }}
          title="Export active sheet as CSV"
        >
          CSV
        </button>
        <button
          onClick={() => {
            import('../io/csv').then((m) => m.exportWorkbookJson(workbook));
          }}
          title="Export workbook as JSON"
        >
          JSON
        </button>
      </div>
      <div className="group">
        <select
          value={currentStyle.fontSize ?? 12}
          onChange={(e) => apply({ fontSize: Number(e.target.value) })}
          title="Font size"
          style={{ width: 54 }}
        >
          {[9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 48].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          className={currentStyle.bold ? 'active' : ''}
          onClick={() => apply({ bold: !currentStyle.bold })}
          title="Bold (Ctrl+B)"
        >
          <b>B</b>
        </button>
        <button
          className={currentStyle.italic ? 'active' : ''}
          onClick={() => apply({ italic: !currentStyle.italic })}
          title="Italic (Ctrl+I)"
        >
          <i>I</i>
        </button>
        <button
          className={currentStyle.underline ? 'active' : ''}
          onClick={() => apply({ underline: !currentStyle.underline })}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          className={currentStyle.strike ? 'active' : ''}
          onClick={() => apply({ strike: !currentStyle.strike })}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>
      <div className="group">
        <button
          className={currentStyle.align === 'left' ? 'active' : ''}
          onClick={() => apply({ align: 'left' })}
          title="Align left"
        >
          ⟵
        </button>
        <button
          className={currentStyle.align === 'center' ? 'active' : ''}
          onClick={() => apply({ align: 'center' })}
          title="Center"
        >
          ↔
        </button>
        <button
          className={currentStyle.align === 'right' ? 'active' : ''}
          onClick={() => apply({ align: 'right' })}
          title="Align right"
        >
          ⟶
        </button>
      </div>
      <div className="group">
        <button
          className={currentStyle.valign === 'top' ? 'active' : ''}
          onClick={() => apply({ valign: 'top' })}
          title="Align top"
        >
          ⤒
        </button>
        <button
          className={currentStyle.valign === 'middle' ? 'active' : ''}
          onClick={() => apply({ valign: 'middle' })}
          title="Align middle"
        >
          ≡
        </button>
        <button
          className={currentStyle.valign === 'bottom' ? 'active' : ''}
          onClick={() => apply({ valign: 'bottom' })}
          title="Align bottom"
        >
          ⤓
        </button>
        <button
          className={currentStyle.wrap ? 'active' : ''}
          onClick={() => apply({ wrap: !currentStyle.wrap })}
          title="Wrap text"
        >
          ↵
        </button>
      </div>
      <div className="group">
        <label>
          <span style={{ marginRight: 4 }}>Fill</span>
          <input
            type="color"
            value={currentStyle.fill ?? '#ffffff'}
            onChange={(e) => apply({ fill: e.target.value })}
          />
        </label>
        <label>
          <span style={{ marginRight: 4 }}>Text</span>
          <input
            type="color"
            value={currentStyle.color ?? '#000000'}
            onChange={(e) => apply({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="group">
        <BorderMenu onApply={apply} />
        <button onClick={toggleMerge} title={hasMergeAtActive ? 'Unmerge' : 'Merge'}>
          {hasMergeAtActive ? '⇤⇥' : '⇥⇤'}
        </button>
        <button
          className={painterActive ? 'active' : ''}
          onClick={startPainter}
          title="Format painter"
          disabled={currentCell?.styleId === undefined}
        >
          🖌
        </button>
        <button
          onClick={() => workbook.createTable(sheet.id, activeRange)}
          title="Convert the selected range into a table"
          disabled={
            activeRange.start.row === activeRange.end.row &&
            activeRange.start.col === activeRange.end.col
          }
        >
          Table
        </button>
        <ConditionalMenu workbook={workbook} sheet={sheet} range={activeRange} />
        <ChartMenu
          workbook={workbook}
          sheet={sheet}
          range={activeRange}
          selection={selection}
        />
        <button onClick={onToggleCharts} title="Open charts panel">
          📊
        </button>
        <PivotMenu
          workbook={workbook}
          sheet={sheet}
          range={activeRange}
          onCreated={onOpenPivots}
        />
        <button onClick={onTogglePivots} title="Open pivot tables panel">
          Σ
        </button>
        <DataMenu
          workbook={workbook}
          sheet={sheet}
          range={activeRange}
          onFind={onFind}
          onSort={(ascending) =>
            sortRange(workbook, sheet, activeRange, [{ col: activeRange.start.col, ascending }])
          }
          onDedupe={() => dedupeRange(workbook, sheet, activeRange)}
          onSplit={(delim) => textToColumns(workbook, sheet, activeRange, { delimiter: delim })}
          onFreeze={() =>
            workbook.apply({
              kind: 'setFreeze',
              sheetId: sheet.id,
              rows: selection.row,
              cols: selection.col,
            })
          }
        />
      </div>
      <div className="group">
        <select
          value={currentStyle.format ?? 'General'}
          onChange={(e) => apply({ format: e.target.value })}
          title="Number format"
        >
          {NUMBER_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="group">
        <select
          value={themeId}
          onChange={(e) => onThemeChange(e.target.value as ThemeId)}
          title="Theme"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="high-contrast">High contrast</option>
        </select>
      </div>
    </div>
  );
}
