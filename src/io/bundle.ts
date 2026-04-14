/**
 * Read-only workbook bundle. Produces a standalone HTML file that embeds the
 * workbook as JSON plus a minimal viewer so it can be shared without shipping
 * the whole app. Every sheet renders through the same HTML builder used by the
 * print module; navigation is via `<details>` accordions.
 */

import type { Workbook } from '../engine/workbook';
import { renderSheetToHtml } from './print';

export function renderReadonlyBundle(workbook: Workbook): string {
  const sheets = workbook.sheets.map((s) => {
    // Strip body wrapper from the full document so we can inline each sheet.
    const html = renderSheetToHtml(workbook, s, { showTitle: false, showHeaders: false });
    const body = html.split('<body>')[1]?.split('</body>')[0] ?? '';
    return `<details open><summary>${escapeHtml(s.name)}</summary>${body}</details>`;
  });

  const title = workbook.sheets[0]?.name ?? 'Workbook';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)} (read only)</title>
<style>
  body { font: 13px -apple-system, system-ui, sans-serif; margin: 24px; color: #111; background: #fafafa; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  details { background: #fff; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 18px; padding: 10px 14px; }
  summary { cursor: pointer; font-weight: 600; font-size: 15px; padding: 2px 0; }
  table { border-collapse: collapse; width: auto; margin-top: 8px; }
  td, th { border: 1px solid #bbb; padding: 2px 6px; vertical-align: middle; }
  .banner { background: #fffae0; border: 1px solid #e8d67a; padding: 6px 10px; border-radius: 4px; margin-bottom: 16px; font-size: 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="banner">This is a read-only snapshot. Formulas are shown as their last computed value.</div>
  ${sheets.join('\n  ')}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadReadonlyBundle(workbook: Workbook, filename = 'workbook.html'): void {
  const html = renderReadonlyBundle(workbook);
  if (typeof document === 'undefined') return;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
