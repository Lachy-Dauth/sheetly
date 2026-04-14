/**
 * Style table: dedupes style records and assigns numeric ids.
 * Cells store only a styleId — a compact int — so many cells can share a style.
 */

export interface BorderSide {
  style: 'none' | 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
  color?: string;
}

export interface Style {
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  indent?: number;
  rotation?: number;
  format?: string;
  border?: {
    top?: BorderSide;
    right?: BorderSide;
    bottom?: BorderSide;
    left?: BorderSide;
  };
}

export class StyleTable {
  private list: Style[] = [{}];
  private byKey = new Map<string, number>([['{}', 0]]);

  private keyOf(style: Style): string {
    const ordered: Record<string, unknown> = {};
    for (const k of Object.keys(style).sort()) {
      const v = (style as Record<string, unknown>)[k];
      if (v === undefined) continue;
      ordered[k] = v;
    }
    return JSON.stringify(ordered);
  }

  intern(style: Style): number {
    const key = this.keyOf(style);
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const id = this.list.length;
    this.list.push(style);
    this.byKey.set(key, id);
    return id;
  }

  get(id: number): Style {
    return this.list[id] ?? {};
  }
}
