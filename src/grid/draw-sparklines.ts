/**
 * Paint an inline sparkline onto a cell's canvas rectangle.
 * Draws directly with the Canvas 2D API (no SVG intermediary) so it layers
 * cleanly with the rest of the cell pipeline.
 */

import type { Sparkline } from '../engine/charts';
import { computeSparkline } from '../charts/sparkline';
import { resolveNumericRange } from '../charts/data';
import type { Workbook } from '../engine/workbook';

export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  sparkline: Sparkline,
  workbook: Workbook,
  defaultSheetId: string,
): void {
  const pad = 2;
  const w = Math.max(4, box.w - pad * 2);
  const h = Math.max(4, box.h - pad * 2);
  const values = resolveNumericRange(workbook, defaultSheetId, sparkline.range);
  if (values.length === 0) return;
  const layout = computeSparkline(sparkline, values, w, h);

  ctx.save();
  ctx.translate(box.x + pad, box.y + pad);
  if (layout.type === 'line' && layout.line.length > 0) {
    ctx.strokeStyle = layout.color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    layout.line.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  } else {
    for (const b of layout.bars) {
      ctx.fillStyle = b.positive ? layout.color : layout.negativeColor;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  ctx.restore();
}
