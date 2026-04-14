/**
 * Threaded comments anchored to cells. A comment has an author, text, and a
 * list of replies. The registry is scoped to a sheet.
 */

import type { Address } from './address';
import { cellKey } from './address';

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  at: number; // epoch ms
}

export interface Comment {
  id: string;
  sheetId: string;
  address: Address;
  author: string;
  text: string;
  at: number;
  resolved?: boolean;
  replies: CommentReply[];
}

let nextId = 1;

export function makeCommentId(): string {
  return `c${nextId++}`;
}

export function makeReplyId(): string {
  return `r${nextId++}`;
}

/** Indexes comments by cell address for O(1) grid-draw lookups. */
export class CommentRegistry {
  private byId = new Map<string, Comment>();
  private byCell = new Map<string, string>(); // sheetId|cellKey -> id

  private key(sheetId: string, a: Address): string {
    return `${sheetId}|${cellKey(a.row, a.col)}`;
  }

  add(c: Comment): void {
    this.byId.set(c.id, c);
    this.byCell.set(this.key(c.sheetId, c.address), c.id);
  }

  remove(id: string): Comment | undefined {
    const c = this.byId.get(id);
    if (!c) return undefined;
    this.byId.delete(id);
    this.byCell.delete(this.key(c.sheetId, c.address));
    return c;
  }

  get(id: string): Comment | undefined {
    return this.byId.get(id);
  }

  findAt(sheetId: string, a: Address): Comment | undefined {
    const id = this.byCell.get(this.key(sheetId, a));
    return id ? this.byId.get(id) : undefined;
  }

  forSheet(sheetId: string): Comment[] {
    return [...this.byId.values()].filter((c) => c.sheetId === sheetId);
  }

  hasAt(sheetId: string, a: Address): boolean {
    return this.byCell.has(this.key(sheetId, a));
  }

  /** Exported plain-object form for serialisation. */
  toJSON(): Comment[] {
    return [...this.byId.values()];
  }

  static fromJSON(list: Comment[]): CommentRegistry {
    const r = new CommentRegistry();
    for (const c of list) r.add(c);
    return r;
  }
}
