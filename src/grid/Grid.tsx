/**
 * Placeholder grid for M1. M2 replaces this with a canvas-virtualised renderer.
 * For now we show a lightweight HTML table so the app is interactive.
 */

import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address } from '../engine/address';
import { addressToA1, colToLetters } from '../engine/address';
import { isFormula, toText } from '../engine/cell';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address;
  onSelectionChange: (a: Address) => void;
  onDropFiles: (files: File[]) => void;
}

export function Grid({ workbook, sheet, selection, onSelectionChange, onDropFiles }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const rows = Math.max(sheet.rowCount, 40);
  const cols = Math.max(sheet.colCount, 12);

  const renderCell = (row: number, col: number) => {
    const addr: Address = { row, col };
    const cell = sheet.getCell(addr);
    const selected = row === selection.row && col === selection.col;
    const display =
      cell === undefined
        ? ''
        : toText(cell.computed ?? cell.value ?? (typeof cell.raw === 'string' ? cell.raw : cell.raw));
    const isEditing = editing === addressToA1(addr);
    return (
      <td
        key={col}
        onClick={() => onSelectionChange(addr)}
        onDoubleClick={() => setEditing(addressToA1(addr))}
        style={{
          border: '1px solid var(--border)',
          padding: '2px 4px',
          minWidth: 80,
          background: selected ? 'var(--accent-bg)' : undefined,
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            defaultValue={
              cell
                ? isFormula(cell.raw)
                  ? cell.raw
                  : cell.raw === null
                    ? ''
                    : String(cell.raw)
                : ''
            }
            onBlur={(e) => {
              workbook.setCellFromInput(sheet.id, addr, e.target.value);
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                workbook.setCellFromInput(sheet.id, addr, (e.target as HTMLInputElement).value);
                setEditing(null);
              } else if (e.key === 'Escape') {
                setEditing(null);
              }
            }}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent' }}
          />
        ) : (
          display
        )}
      </td>
    );
  };

  return (
    <div
      className="grid-container"
      style={{ overflow: 'auto' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ background: 'var(--header-bg)', width: 40 }}></th>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} style={{ background: 'var(--header-bg)', padding: '2px 4px' }}>
                {colToLetters(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <th style={{ background: 'var(--header-bg)', padding: '2px 4px' }}>{r + 1}</th>
              {Array.from({ length: cols }, (_, c) => renderCell(r, c))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
