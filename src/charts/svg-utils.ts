/** Small SVG helper primitives shared across chart renderers. */

export function escapeXml(input: string): string {
  return input.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(2)).toString();
}
