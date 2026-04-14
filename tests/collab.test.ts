import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/engine/workbook';
import { renderSheetToHtml } from '../src/io/print';
import { renderReadonlyBundle } from '../src/io/bundle';
import { isEditAllowed } from '../src/engine/protection';

describe('sheet protection', () => {
  it('blocks edits when protection is enabled', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    w.setProtection(sid, { enabled: true });
    const res = w.setCellFromInput(sid, { row: 0, col: 0 }, 'locked out');
    expect(res.ok).toBe(false);
    const sheet = w.getSheet(sid);
    expect(sheet.getCell({ row: 0, col: 0 })).toBeUndefined();
  });

  it('allows edits inside an allow-range', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    w.setProtection(sid, {
      enabled: true,
      allowRanges: [{ start: { row: 0, col: 0 }, end: { row: 2, col: 2 } }],
    });
    expect(w.setCellFromInput(sid, { row: 1, col: 1 }, 'inside').ok).toBe(true);
    expect(w.setCellFromInput(sid, { row: 5, col: 5 }, 'outside').ok).toBe(false);
  });

  it('undo restores previous protection state', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    w.setProtection(sid, { enabled: true });
    expect(w.getSheet(sid).protection?.enabled).toBe(true);
    w.undo();
    expect(w.getSheet(sid).protection).toBeUndefined();
  });

  it('isEditAllowed returns true when no protection is set', () => {
    expect(isEditAllowed(undefined, { row: 0, col: 0 })).toBe(true);
    expect(isEditAllowed({ enabled: false }, { row: 0, col: 0 })).toBe(true);
  });
});

describe('threaded comments', () => {
  it('creates a comment on a cell', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 2, col: 3 }, { author: 'Ada', text: 'Check this.' });
    expect(c.text).toBe('Check this.');
    expect(w.comments.findAt(sid, { row: 2, col: 3 })?.id).toBe(c.id);
  });

  it('adding to the same cell becomes a reply', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 0, col: 0 }, { author: 'Ada', text: 'First' });
    w.addComment(sid, { row: 0, col: 0 }, { author: 'Bee', text: 'Second' });
    expect(w.comments.get(c.id)!.replies).toHaveLength(1);
    expect(w.comments.get(c.id)!.replies[0]!.author).toBe('Bee');
  });

  it('replyToComment adds threaded replies', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 0, col: 0 }, { author: 'A', text: 'Root' });
    w.replyToComment(c.id, { author: 'B', text: 'Reply 1' });
    w.replyToComment(c.id, { author: 'C', text: 'Reply 2' });
    expect(w.comments.get(c.id)!.replies).toHaveLength(2);
  });

  it('undo removes a freshly posted comment', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 1, col: 1 }, { author: 'A', text: 'Hi' });
    expect(w.comments.get(c.id)).toBeDefined();
    w.undo();
    expect(w.comments.get(c.id)).toBeUndefined();
  });

  it('removeComment is reversible', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 0, col: 0 }, { author: 'A', text: 'X' });
    w.removeComment(c.id);
    expect(w.comments.get(c.id)).toBeUndefined();
    w.undo();
    expect(w.comments.get(c.id)).toBeDefined();
  });

  it('undo of removeCommentReply restores the reply at its original position', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    const c = w.addComment(sid, { row: 0, col: 0 }, { author: 'A', text: 'Root' });
    const r1 = w.replyToComment(c.id, { author: 'B', text: 'one' });
    const r2 = w.replyToComment(c.id, { author: 'C', text: 'two' });
    const r3 = w.replyToComment(c.id, { author: 'D', text: 'three' });
    // Remove the middle reply.
    w.removeCommentReply(c.id, r2.id);
    expect(w.comments.get(c.id)!.replies.map((r) => r.id)).toEqual([r1.id, r3.id]);
    w.undo();
    // Should be restored at index 1 (between r1 and r3) — not appended.
    expect(w.comments.get(c.id)!.replies.map((r) => r.id)).toEqual([r1.id, r2.id, r3.id]);
  });
});

describe('HTML export', () => {
  it('renders a sheet to self-contained HTML with cell values', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    w.setCellFromInput(sid, { row: 0, col: 0 }, 'Name');
    w.setCellFromInput(sid, { row: 0, col: 1 }, 'Score');
    w.setCellFromInput(sid, { row: 1, col: 0 }, 'Ada');
    w.setCellFromInput(sid, { row: 1, col: 1 }, '99');
    const html = renderSheetToHtml(w, w.getSheet(sid));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Ada');
    expect(html).toContain('99');
    expect(html).toContain('<table>');
  });

  it('read-only bundle wraps every sheet in a details block', () => {
    const w = Workbook.createDefault();
    const sid = w.sheets[0]!.id;
    w.setCellFromInput(sid, { row: 0, col: 0 }, 'Alpha');
    w.addSheet('Second');
    const html = renderReadonlyBundle(w);
    expect(html).toContain('<details');
    expect(html).toContain('Sheet1');
    expect(html).toContain('Second');
    expect(html).toContain('read-only');
  });
});
