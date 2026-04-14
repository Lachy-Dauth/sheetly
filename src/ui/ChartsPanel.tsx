import { useMemo, useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Chart, ChartType, LegendPos, TrendlineType } from '../engine/charts';
import { renderChartSvg } from '../charts/render';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  onClose: () => void;
}

/** Side panel: preview every chart on the active sheet, edit type / title / series. */
export function ChartsPanel({ workbook, sheet, onClose }: Props) {
  const [activeId, setActiveId] = useState<string | null>(sheet.charts[0]?.id ?? null);
  const active = useMemo(
    () => sheet.charts.find((c) => c.id === activeId) ?? sheet.charts[0],
    [sheet.charts, activeId],
  );

  return (
    <div className="side-panel" role="complementary" aria-label="Charts">
      <div className="side-panel-head">
        <strong>Charts</strong>
        <button onClick={onClose} title="Close charts panel">
          ×
        </button>
      </div>
      <div className="side-panel-body">
        {sheet.charts.length === 0 ? (
          <p className="muted">
            No charts yet. Select a range and use the <em>Chart</em> toolbar button.
          </p>
        ) : (
          <>
            <ul className="chart-list">
              {sheet.charts.map((c) => (
                <li key={c.id}>
                  <button
                    className={c.id === active?.id ? 'active' : ''}
                    onClick={() => setActiveId(c.id)}
                  >
                    {c.options.title ?? `${c.type} ${c.id}`}
                  </button>
                </li>
              ))}
            </ul>
            {active ? <ChartEditor workbook={workbook} chart={active} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function ChartEditor({ workbook, chart }: { workbook: Workbook; chart: Chart }) {
  const [, bump] = useState(0);
  const mutate = (patch: Partial<Chart>) => {
    workbook.updateChart(chart.id, patch);
    bump((n) => n + 1);
  };
  const svg = useMemo(() => renderChartSvg(chart, workbook), [chart, workbook, chart.options, chart.type, chart.series]);

  const trendlineFor = (idx: number): TrendlineType | '' =>
    (chart.series[idx]?.trendline as TrendlineType | undefined) ?? '';

  return (
    <div className="chart-editor">
      <div
        className="chart-preview"
        // Self-rendered SVG is fully controlled by us — safe to inject.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <label>
        Type
        <select
          value={chart.type}
          onChange={(e) => mutate({ type: e.target.value as ChartType })}
        >
          {(['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'] as ChartType[]).map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Title
        <input
          value={chart.options.title ?? ''}
          onChange={(e) =>
            mutate({ options: { ...chart.options, title: e.target.value || undefined } })
          }
        />
      </label>
      <label>
        Legend
        <select
          value={chart.options.legend ?? 'bottom'}
          onChange={(e) =>
            mutate({ options: { ...chart.options, legend: e.target.value as LegendPos } })
          }
        >
          {(['top', 'right', 'bottom', 'left', 'none'] as LegendPos[]).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={chart.options.stacked ?? false}
          onChange={(e) =>
            mutate({ options: { ...chart.options, stacked: e.target.checked || undefined } })
          }
        />
        Stacked
      </label>
      {chart.type === 'line' || chart.type === 'area' ? (
        <label>
          First-series trendline
          <select
            value={trendlineFor(0)}
            onChange={(e) => {
              const v = e.target.value as TrendlineType | '';
              const series = chart.series.slice();
              if (series[0]) {
                series[0] = { ...series[0], trendline: v || undefined };
              } else {
                series[0] = v ? { trendline: v as TrendlineType } : {};
              }
              mutate({ series });
            }}
          >
            <option value="">None</option>
            <option value="linear">Linear</option>
            <option value="exp">Exponential</option>
            <option value="log">Logarithmic</option>
            <option value="poly2">Polynomial (deg 2)</option>
            <option value="poly3">Polynomial (deg 3)</option>
          </select>
        </label>
      ) : null}
      <button
        onClick={() => {
          if (confirm('Delete this chart?')) workbook.removeChart(chart.sheetId, chart.id);
        }}
      >
        Delete chart
      </button>
    </div>
  );
}
