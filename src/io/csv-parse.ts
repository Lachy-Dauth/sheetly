/**
 * RFC 4180-compliant CSV parser with configurable delimiter/quote/escape,
 * encoding detection for UTF-8 BOM and UTF-16 LE/BE, and a streaming parser
 * for very large inputs.
 */

export interface CsvOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  /** Treat first row as header? Not used for parsing, informative only. */
  header?: boolean;
  newline?: string | 'auto';
}

export const DEFAULT_OPTIONS: Required<Omit<CsvOptions, 'newline'>> & {
  newline: string | 'auto';
} = {
  delimiter: ',',
  quote: '"',
  escape: '"',
  header: false,
  newline: 'auto',
};

export interface DetectedEncoding {
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'ascii';
  bom: boolean;
}

export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bom: true };
  }
  return { encoding: 'utf-8', bom: false };
}

export function decodeText(bytes: Uint8Array): string {
  const det = detectEncoding(bytes);
  const label = det.encoding;
  const decoder = new TextDecoder(label);
  const body = det.bom ? bytes.subarray(label === 'utf-8' ? 3 : 2) : bytes;
  return decoder.decode(body);
}

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 8192);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const lines = sample.split(/\r?\n/).slice(0, 10);
    const counts = lines.map((l) => (l ? l.split(d).length - 1 : 0));
    if (counts.length < 2) continue;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mean === 0) continue;
    const variance =
      counts.reduce((a, c) => a + (c - mean) * (c - mean), 0) / counts.length;
    const score = mean / (1 + variance);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string, options: CsvOptions = {}): string[][] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const delim = opts.delimiter;
  const quote = opts.quote;
  const escape = opts.escape;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const len = text.length;
  let i = 0;
  while (i < len) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === escape && escape !== quote && text[i + 1] === quote) {
        field += quote;
        i += 2;
        continue;
      }
      if (c === quote) {
        if (text[i + 1] === quote && escape === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === quote && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // Treat \r\n as single newline.
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      if (text[i] === '\n') i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Stream a (possibly huge) text through a callback, one row at a time. */
export function streamCsv(
  iter: AsyncIterable<string>,
  onRow: (row: string[], rowIndex: number) => void | Promise<void>,
  options: CsvOptions = {},
): Promise<void> {
  return (async () => {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const delim = opts.delimiter;
    const quote = opts.quote;
    const escape = opts.escape;
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let rowIndex = 0;
    let pending = '';

    for await (const chunk of iter) {
      const s = pending + chunk;
      pending = '';
      let i = 0;
      const len = s.length;
      while (i < len) {
        const c = s[i]!;
        if (inQuotes) {
          if (c === escape && escape !== quote && s[i + 1] === quote) {
            field += quote;
            i += 2;
            continue;
          }
          if (c === quote) {
            if (s[i + 1] === quote && escape === quote) {
              field += quote;
              i += 2;
              continue;
            }
            inQuotes = false;
            i++;
            continue;
          }
          field += c;
          i++;
          continue;
        }
        if (c === quote && field === '') {
          inQuotes = true;
          i++;
          continue;
        }
        if (c === delim) {
          row.push(field);
          field = '';
          i++;
          continue;
        }
        if (c === '\n' || c === '\r') {
          row.push(field);
          await onRow(row, rowIndex++);
          row = [];
          field = '';
          i++;
          if (c === '\r' && s[i] === '\n') i++;
          continue;
        }
        field += c;
        i++;
      }
      // Preserve tail to re-scan with next chunk (may still be inside quotes).
      if (inQuotes || field) {
        pending = field;
        field = '';
      }
    }
    if (pending !== '' || field !== '' || row.length > 0) {
      row.push(pending + field);
      await onRow(row, rowIndex++);
    }
  })();
}

export function escapeField(v: string, delim = ','): string {
  if (v === '') return '';
  if (v.includes(delim) || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
