import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address, RangeAddress } from '../engine/address';
import { rangeToA1 } from '../engine/address';
import type { ChartType, SparklineType } from '../engine/charts';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  range: RangeAddress;
  selection: Address;
}

/** Toolbar dropdown: create charts from the selection or attach sparklines. */
export function ChartMenu({ workbook, sheet, range, selection }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const addChart = (type: ChartType) => {
    close();
    workbook.addChart(sheet.id, type, range, {
      options: { legend: 'bottom', title: `${label(type)} chart` },
    });
  };

  const addSparkline = (type: SparklineType) => {
    close();
    workbook.setSparkline(sheet.id, selection, {
      type,
      range: rangeToA1(range),
    });
  };

  const types: Array<[ChartType, string]> = [
    ['column', 'Column'],
    ['bar', 'Bar'],
    ['line', 'Line'],
    ['area', 'Area'],
    ['pie', 'Pie'],
    ['doughnut', 'Doughnut'],
    ['scatter', 'Scatter'],
  ];
  const sparks: Array<[SparklineType, string]> = [
    ['line', 'Line sparkline'],
    ['column', 'Column sparkline'],
    ['winloss', 'Win/loss sparkline'],
  ];

  return (
    <div className="dropdown" onMouseLeave={close}>
      <button onClick={() => setOpen((v) => !v)} title="Insert chart or sparkline">
        Chart ▾
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu" style={{ minWidth: 220 }}>
          <div className="dropdown-head">Chart from selection</div>
          {types.map(([t, lbl]) => (
            <button key={t} onClick={() => addChart(t)}>
              {lbl}
            </button>
          ))}
          <hr />
          <div className="dropdown-head">Sparkline into active cell</div>
          {sparks.map(([t, lbl]) => (
            <button key={t} onClick={() => addSparkline(t)}>
              {lbl}
            </button>
          ))}
          {sheet.getCell(selection)?.sparkline ? (
            <>
              <hr />
              <button onClick={() => {
                close();
                workbook.setSparkline(sheet.id, selection, undefined);
              }}>
                Remove sparkline
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function label(t: ChartType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
