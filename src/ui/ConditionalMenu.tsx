import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { RangeAddress } from '../engine/address';
import type { NewRule } from '../engine/conditional';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  range: RangeAddress;
}

/** Dropdown that adds one of a few canned conditional-formatting presets. */
export function ConditionalMenu({ workbook, sheet, range }: Props) {
  const [open, setOpen] = useState(false);

  const addRule = (rule: NewRule) => {
    workbook.addConditionalRule(sheet.id, rule);
    setOpen(false);
  };

  const presets: Array<[string, () => void]> = [
    [
      'Greater than 0 → green',
      () =>
        addRule({
          kind: 'cellIs',
          op: '>',
          value: 0,
          range,
          style: { fill: '#dcfce7', color: '#166534' },
        }),
    ],
    [
      'Less than 0 → red',
      () =>
        addRule({
          kind: 'cellIs',
          op: '<',
          value: 0,
          range,
          style: { fill: '#fee2e2', color: '#991b1b' },
        }),
    ],
    [
      'Duplicate values',
      () =>
        addRule({
          kind: 'duplicates',
          mode: 'duplicate',
          range,
          style: { fill: '#fff7d6', color: '#713f12' },
        }),
    ],
    [
      'Top 10%',
      () =>
        addRule({
          kind: 'topBottom',
          n: 10,
          percent: true,
          top: true,
          range,
          style: { fill: '#dbeafe', bold: true },
        }),
    ],
    [
      'Color scale: red→white→green',
      () =>
        addRule({
          kind: 'colorScale',
          range,
          min: { kind: 'min', color: '#f87171' },
          mid: { kind: 'percent', value: 50, color: '#ffffff' },
          max: { kind: 'max', color: '#4ade80' },
        }),
    ],
    [
      'Data bar (blue)',
      () => addRule({ kind: 'dataBar', color: '#60a5fa', range }),
    ],
  ];

  const clearAll = () => {
    for (const rule of [...sheet.conditionalRules]) {
      workbook.removeConditionalRule(sheet.id, rule.id);
    }
    setOpen(false);
  };

  return (
    <div className="dropdown" onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} title="Conditional formatting">
        CF ▾
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu" style={{ minWidth: 220 }}>
          {presets.map(([label, run]) => (
            <button key={label} onClick={run}>
              {label}
            </button>
          ))}
          <hr />
          <button onClick={clearAll}>Clear all rules on sheet</button>
        </div>
      ) : null}
    </div>
  );
}
