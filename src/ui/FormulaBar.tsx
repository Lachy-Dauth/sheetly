import { useEffect, useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address } from '../engine/address';
import { addressToA1 } from '../engine/address';
import { isFormula } from '../engine/cell';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address;
}

export function FormulaBar({ workbook, sheet, selection }: Props) {
  const cell = sheet.getCell(selection);
  const initial = cell
    ? isFormula(cell.raw)
      ? (cell.raw as string)
      : cell.raw === null || cell.raw === undefined
        ? ''
        : String(cell.raw)
    : '';
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial, sheet.id, selection.row, selection.col]);

  const commit = () => {
    workbook.setCellFromInput(sheet.id, selection, value);
  };

  return (
    <div className="formula-bar">
      <div className="name-box" aria-label="Active cell">
        {addressToA1(selection)}
      </div>
      <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>fx</span>
      <input
        className="fx"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setValue(initial);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
