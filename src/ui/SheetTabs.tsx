import type { Workbook } from '../engine/workbook';

interface Props {
  workbook: Workbook;
  activeSheetId: string;
  onSelect: (id: string) => void;
}

export function SheetTabs({ workbook, activeSheetId, onSelect }: Props) {
  return (
    <div className="sheet-tabs" role="tablist">
      {workbook.sheets.map((s) => (
        <div
          key={s.id}
          role="tab"
          aria-selected={s.id === activeSheetId}
          className={`tab${s.id === activeSheetId ? ' active' : ''}`}
          onClick={() => onSelect(s.id)}
          onDoubleClick={() => {
            const name = prompt('Rename sheet', s.name);
            if (name && name.trim()) {
              workbook.apply({ kind: 'renameSheet', sheetId: s.id, name: name.trim() });
            }
          }}
          style={s.color ? { borderBottom: `2px solid ${s.color}` } : undefined}
        >
          {s.name}
        </div>
      ))}
      <button
        className="add"
        onClick={() => {
          const sheet = workbook.addSheet();
          onSelect(sheet.id);
        }}
      >
        +
      </button>
    </div>
  );
}
