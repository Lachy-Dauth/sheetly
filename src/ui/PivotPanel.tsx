import { useMemo, useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type {
  Pivot,
  PivotAggregate,
  PivotField,
  PivotGrouping,
  PivotValueField,
} from '../engine/pivots';
import { buildPivotCache } from '../engine/pivot-cache';
import { computePivotLayout } from '../engine/pivot-layout';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  onClose: () => void;
}

export function PivotPanel({ workbook, sheet, onClose }: Props) {
  const pivots = workbook.pivots.listForSheet(sheet.id);
  const [activeId, setActiveId] = useState<string | null>(pivots[0]?.id ?? null);
  const active = pivots.find((p) => p.id === activeId) ?? pivots[0];

  return (
    <div className="side-panel" role="complementary" aria-label="Pivot tables">
      <div className="side-panel-head">
        <strong>Pivot tables</strong>
        <button onClick={onClose} title="Close pivot panel">
          ×
        </button>
      </div>
      <div className="side-panel-body">
        {pivots.length === 0 ? (
          <p className="muted">
            No pivots on this sheet. Select a data range with headers and use the{' '}
            <em>Pivot</em> toolbar button.
          </p>
        ) : (
          <>
            <ul className="chart-list">
              {pivots.map((p) => (
                <li key={p.id}>
                  <button
                    className={p.id === active?.id ? 'active' : ''}
                    onClick={() => setActiveId(p.id)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            {active ? <PivotEditor workbook={workbook} pivot={active} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function PivotEditor({ workbook, pivot }: { workbook: Workbook; pivot: Pivot }) {
  const cache = useMemo(() => buildPivotCache(workbook, pivot.source), [workbook, pivot.source]);
  const preview = useMemo(() => computePivotLayout(pivot, cache), [pivot, cache]);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const mutate = (patch: Partial<Pivot>) => {
    workbook.updatePivot(pivot.id, patch);
    rerender();
  };

  const fieldNames = cache.headers;
  const unused = fieldNames
    .map((_h, i) => i)
    .filter(
      (i) =>
        !pivot.rows.some((f) => f.sourceColumn === i) &&
        !pivot.cols.some((f) => f.sourceColumn === i) &&
        !pivot.values.some((f) => f.sourceColumn === i),
    );

  const addField = (axis: 'rows' | 'cols' | 'values', col: number) => {
    if (axis === 'values') {
      mutate({
        values: [...pivot.values, { sourceColumn: col, agg: 'sum' } as PivotValueField],
      });
    } else {
      mutate({ [axis]: [...pivot[axis], { sourceColumn: col }] });
    }
  };

  const removeField = (axis: 'rows' | 'cols' | 'values', idx: number) => {
    const next = [...pivot[axis]];
    next.splice(idx, 1);
    mutate({ [axis]: next });
  };

  const setGrouping = (axis: 'rows' | 'cols', idx: number, grouping: PivotGrouping) => {
    const next = pivot[axis].map((f, i) => (i === idx ? { ...f, grouping } : f));
    mutate({ [axis]: next });
  };

  const setAgg = (idx: number, agg: PivotAggregate) => {
    const next = pivot.values.map((f, i) => (i === idx ? { ...f, agg } : f));
    mutate({ values: next });
  };

  return (
    <div className="chart-editor">
      <label>
        Name
        <input
          value={pivot.name}
          onChange={(e) => mutate({ name: e.target.value })}
        />
      </label>
      <FieldAxis
        title="Rows"
        fields={pivot.rows}
        headers={fieldNames}
        onRemove={(i) => removeField('rows', i)}
        onSetGrouping={(i, g) => setGrouping('rows', i, g)}
      />
      <FieldAxis
        title="Columns"
        fields={pivot.cols}
        headers={fieldNames}
        onRemove={(i) => removeField('cols', i)}
        onSetGrouping={(i, g) => setGrouping('cols', i, g)}
      />
      <ValueAxis
        fields={pivot.values}
        headers={fieldNames}
        onRemove={(i) => removeField('values', i)}
        onSetAgg={setAgg}
      />
      {unused.length > 0 ? (
        <label>
          Add field
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const [axis, colStr] = e.target.value.split(':');
              const col = Number(colStr);
              addField(axis as 'rows' | 'cols' | 'values', col);
              e.target.value = '';
            }}
          >
            <option value="">Select column…</option>
            {unused.map((i) => (
              <optgroup key={i} label={fieldNames[i] ?? `Col${i + 1}`}>
                <option value={`rows:${i}`}>→ Rows</option>
                <option value={`cols:${i}`}>→ Columns</option>
                <option value={`values:${i}`}>→ Values (sum)</option>
              </optgroup>
            ))}
          </select>
        </label>
      ) : null}
      <div className="row">
        <button
          onClick={() => {
            workbook.refreshPivot(pivot.id);
            rerender();
          }}
        >
          Write to sheet
        </button>
        <button
          onClick={() => {
            if (confirm('Delete this pivot?')) workbook.removePivot(pivot.id);
          }}
        >
          Delete
        </button>
      </div>
      <div className="pivot-preview">
        <table>
          <tbody>
            {preview.matrix.map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => (
                  <td key={c}>{v == null ? '' : typeof v === 'number' ? format(v) : String(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldAxis({
  title,
  fields,
  headers,
  onRemove,
  onSetGrouping,
}: {
  title: string;
  fields: PivotField[];
  headers: string[];
  onRemove: (i: number) => void;
  onSetGrouping: (i: number, grouping: PivotGrouping) => void;
}) {
  return (
    <div className="pivot-axis">
      <strong>{title}</strong>
      {fields.length === 0 ? <span className="muted"> — empty</span> : null}
      <ul>
        {fields.map((f, i) => (
          <li key={i}>
            {headers[f.sourceColumn] ?? `Col${f.sourceColumn + 1}`}
            <select
              value={groupingTag(f.grouping)}
              onChange={(e) => onSetGrouping(i, parseGrouping(e.target.value))}
            >
              <option value="none">—</option>
              <option value="date:year">Year</option>
              <option value="date:quarter">Quarter</option>
              <option value="date:month">Month</option>
              <option value="date:day">Day</option>
              <option value="numberRange:10">Bin 10</option>
              <option value="numberRange:100">Bin 100</option>
            </select>
            <button onClick={() => onRemove(i)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ValueAxis({
  fields,
  headers,
  onRemove,
  onSetAgg,
}: {
  fields: PivotValueField[];
  headers: string[];
  onRemove: (i: number) => void;
  onSetAgg: (i: number, agg: PivotAggregate) => void;
}) {
  const aggs: PivotAggregate[] = ['sum', 'count', 'avg', 'min', 'max', 'stdev', 'var', 'distinctCount'];
  return (
    <div className="pivot-axis">
      <strong>Values</strong>
      {fields.length === 0 ? <span className="muted"> — empty</span> : null}
      <ul>
        {fields.map((f, i) => (
          <li key={i}>
            {headers[f.sourceColumn] ?? `Col${f.sourceColumn + 1}`}
            <select value={f.agg} onChange={(e) => onSetAgg(i, e.target.value as PivotAggregate)}>
              {aggs.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button onClick={() => onRemove(i)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupingTag(g?: PivotGrouping): string {
  if (!g || g.kind === 'none') return 'none';
  if (g.kind === 'date') return `date:${g.unit}`;
  if (g.kind === 'numberRange') return `numberRange:${g.step}`;
  return 'none';
}

function parseGrouping(tag: string): PivotGrouping {
  if (tag === 'none') return { kind: 'none' };
  const [kind, arg] = tag.split(':');
  if (kind === 'date') {
    return { kind: 'date', unit: (arg ?? 'month') as 'year' | 'quarter' | 'month' | 'day' };
  }
  if (kind === 'numberRange') return { kind: 'numberRange', step: Number(arg ?? 10) };
  return { kind: 'none' };
}

function format(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
