/**
 * Top-level SVG chart renderer: dispatches to the type-specific painter,
 * wraps the result with a title, legend, and the outer <svg> element.
 */

import type { Chart } from '../engine/charts';
import { resolveChartData, type ResolvedChartData } from './data';
import type { Workbook } from '../engine/workbook';
import { computePlot } from './layout';
import { escapeXml, fmtNum as fmt } from './svg-utils';
import { renderBarsInto } from './render-bars';
import { renderLineInto } from './render-line';
import { renderPieInto } from './render-pie';
import { renderScatterInto } from './render-scatter';

export interface RenderSize {
  width: number;
  height: number;
}

export function renderChartSvg(
  chart: Chart,
  workbook: Workbook,
  size?: Partial<RenderSize>,
): string {
  const data = resolveChartData(workbook, chart);
  const width = size?.width ?? chart.anchor.width;
  const height = size?.height ?? chart.anchor.height;
  const hasCategoryAxis = chart.type !== 'pie' && chart.type !== 'doughnut';
  const plot = computePlot(width, height, chart.options, hasCategoryAxis);

  let body = '';
  switch (chart.type) {
    case 'column':
      body = renderBarsInto(plot, data, chart.options, 'column');
      break;
    case 'bar':
      body = renderBarsInto(plot, data, chart.options, 'bar');
      break;
    case 'line':
      body = renderLineInto(plot, data, chart.options, false);
      break;
    case 'area':
      body = renderLineInto(plot, data, chart.options, true);
      break;
    case 'pie':
      body = renderPieInto(plot, data, chart.options, false);
      break;
    case 'doughnut':
      body = renderPieInto(plot, data, chart.options, true);
      break;
    case 'scatter':
      body = renderScatterInto(plot, data, chart.options);
      break;
  }

  const title = chart.options.title
    ? `<text x="${fmt(width / 2)}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#24292f">${escapeXml(chart.options.title)}</text>`
    : '';
  const legend = renderLegend(width, height, data, chart);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" role="img" aria-label="${escapeXml(chart.options.title ?? chart.type + ' chart')}">` +
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="#ffffff"/>` +
    title +
    body +
    legend +
    `</svg>`
  );
}

function renderLegend(width: number, height: number, data: ResolvedChartData, chart: Chart): string {
  const pos = chart.options.legend ?? 'bottom';
  if (pos === 'none' || data.series.length === 0) return '';
  const items = chart.type === 'pie' || chart.type === 'doughnut'
    ? data.categories.map((cat, i) => ({
        label: cat,
        color:
          data.series[0]?.color && i === 0
            ? data.series[0].color
            : // Reuse the default palette index-wise.
              defaultColorAt(i),
      }))
    : data.series.map((s) => ({ label: s.name, color: s.color }));
  if (items.length === 0) return '';
  const fontSize = 11;
  const padding = 6;
  const parts: string[] = [];
  if (pos === 'bottom' || pos === 'top') {
    const y = pos === 'bottom' ? height - 10 : 14;
    let cursor = padding;
    for (const it of items) {
      parts.push(
        `<rect x="${fmt(cursor)}" y="${fmt(y - fontSize + 2)}" width="10" height="10" fill="${it.color}"/>`,
      );
      parts.push(
        `<text x="${fmt(cursor + 14)}" y="${fmt(y)}" font-size="${fontSize}" fill="#24292f">${escapeXml(it.label)}</text>`,
      );
      cursor += 14 + it.label.length * 6 + 12;
    }
  } else {
    const x = pos === 'left' ? 8 : width - 100;
    items.forEach((it, i) => {
      const y = 30 + i * 16;
      parts.push(
        `<rect x="${fmt(x)}" y="${fmt(y - 9)}" width="10" height="10" fill="${it.color}"/>`,
      );
      parts.push(
        `<text x="${fmt(x + 14)}" y="${fmt(y)}" font-size="${fontSize}" fill="#24292f">${escapeXml(it.label)}</text>`,
      );
    });
  }
  return parts.join('\n');
}

function defaultColorAt(i: number): string {
  const palette = ['#1f6feb', '#2da44e', '#d29922', '#cf222e', '#8250df', '#218bff', '#bc4c00', '#116329'];
  return palette[i % palette.length]!;
}
