import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address } from '../engine/address';
import type { Style } from '../engine/styles';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address;
  onImport: () => void;
}

export function Toolbar({ workbook, sheet, selection, onImport }: Props) {
  const apply = (patch: Partial<Style>) => {
    workbook.setStyle(sheet.id, { start: selection, end: selection }, patch);
  };

  const currentCell = sheet.getCell(selection);
  const currentStyle =
    currentCell?.styleId !== undefined ? workbook.styles.get(currentCell.styleId) : {};

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
      </div>
      <div className="group">
        <button
          className={currentStyle.align === 'left' ? 'active' : ''}
          onClick={() => apply({ align: 'left' })}
        >
          ⟵
        </button>
        <button
          className={currentStyle.align === 'center' ? 'active' : ''}
          onClick={() => apply({ align: 'center' })}
        >
          ↔
        </button>
        <button
          className={currentStyle.align === 'right' ? 'active' : ''}
          onClick={() => apply({ align: 'right' })}
        >
          ⟶
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
    </div>
  );
}
