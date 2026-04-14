/** Compute the plot area (inner rect) given the outer SVG size + chart config. */

import type { ChartOptions } from '../engine/charts';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Plot {
  outer: Rect;
  inner: Rect;
  legend?: Rect;
  title?: string;
}

const DEFAULT_MARGIN = { top: 36, right: 16, bottom: 48, left: 48 };

export function computePlot(
  width: number,
  height: number,
  opts: ChartOptions,
  hasCategories = true,
): Plot {
  const margin = { ...DEFAULT_MARGIN };
  if (!opts.title) margin.top = 16;
  if (!hasCategories) margin.bottom = 24;
  const legendPos = opts.legend ?? 'bottom';
  if (legendPos === 'top') margin.top += 18;
  if (legendPos === 'bottom') margin.bottom += 18;
  if (legendPos === 'left') margin.left += 96;
  if (legendPos === 'right') margin.right += 96;
  const inner: Rect = {
    x0: margin.left,
    y0: margin.top,
    x1: width - margin.right,
    y1: height - margin.bottom,
  };
  return {
    outer: { x0: 0, y0: 0, x1: width, y1: height },
    inner,
    title: opts.title,
  };
}
