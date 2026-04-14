import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { RangeAddress } from '../engine/address';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  range: RangeAddress;
  onFind: () => void;
  onSort: (ascending: boolean) => void;
  onDedupe: () => void;
  onSplit: (delimiter: string) => void;
  onFreeze: () => void;
}

/** Data-tools dropdown: find/replace, sort, dedupe, text-to-columns, freeze. */
export function DataMenu({ workbook, sheet, onFind, onSort, onDedupe, onSplit, onFreeze }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="dropdown" onMouseLeave={close}>
      <button onClick={() => setOpen((v) => !v)} title="Data tools">
        Data ▾
      </button>
      {open ? (
        <div className="dropdown-menu" style={{ minWidth: 200 }}>
          <button
            onClick={() => {
              close();
              onFind();
            }}
          >
            Find &amp; replace…
          </button>
          <hr />
          <button
            onClick={() => {
              close();
              onSort(true);
            }}
          >
            Sort ↑
          </button>
          <button
            onClick={() => {
              close();
              onSort(false);
            }}
          >
            Sort ↓
          </button>
          <button
            onClick={() => {
              close();
              onDedupe();
            }}
          >
            Remove duplicates
          </button>
          <button
            onClick={() => {
              close();
              const delim = window.prompt('Split on delimiter:', ',') ?? '';
              if (delim) onSplit(delim);
            }}
          >
            Text to columns…
          </button>
          <hr />
          <button
            onClick={() => {
              close();
              onFreeze();
            }}
          >
            Freeze at selection
          </button>
          <button
            onClick={() => {
              close();
              workbook.apply({ kind: 'setFreeze', sheetId: sheet.id, rows: 0, cols: 0 });
            }}
          >
            Unfreeze
          </button>
        </div>
      ) : null}
    </div>
  );
}
