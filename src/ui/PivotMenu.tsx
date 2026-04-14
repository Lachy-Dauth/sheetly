import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { RangeAddress } from '../engine/address';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  range: RangeAddress;
  onCreated?: () => void;
}

/**
 * Toolbar dropdown: create a new pivot from the selected range. The pivot is
 * added empty (no rows/cols/values) so the user can configure it in the panel
 * that opens automatically afterwards.
 */
export function PivotMenu({ workbook, sheet, range, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const isSingleCell =
    range.start.row === range.end.row && range.start.col === range.end.col;

  const createPivot = (hasHeader: boolean) => {
    close();
    // Anchor output two columns to the right of the source range.
    const output = { row: range.start.row, col: range.end.col + 2 };
    workbook.addPivot({
      sheetId: sheet.id,
      output,
      source: { sheetId: sheet.id, range, hasHeader },
      name: `Pivot${workbook.pivots.all().length + 1}`,
    });
    onCreated?.();
  };

  return (
    <div className="dropdown" onMouseLeave={close}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Create a pivot table from the selection"
        disabled={isSingleCell}
      >
        Pivot ▾
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu" style={{ minWidth: 220 }}>
          <div className="dropdown-head">New pivot from selection</div>
          <button onClick={() => createPivot(true)}>With header row</button>
          <button onClick={() => createPivot(false)}>No header row</button>
        </div>
      ) : null}
    </div>
  );
}
