import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import type { Address } from '../engine/address';
import { addressToA1 } from '../engine/address';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  selection: Address;
  onClose: () => void;
}

/** Side panel for reading and replying to threaded cell comments. */
export function CommentsPanel({ workbook, sheet, selection, onClose }: Props) {
  const [author, setAuthor] = useState(() => loadAuthor());
  const [newText, setNewText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const comments = workbook.comments
    .forSheet(sheet.id)
    .slice()
    .sort((a, b) => a.at - b.at);

  const active = comments.find((c) => c.id === activeId) ?? null;

  const saveAuthor = (v: string) => {
    setAuthor(v);
    try {
      localStorage.setItem('sheetly.commentAuthor', v);
    } catch {
      /* ignore */
    }
  };

  const add = () => {
    if (!newText.trim()) return;
    workbook.addComment(sheet.id, selection, { author: author || 'Anon', text: newText.trim() });
    setNewText('');
  };

  const reply = () => {
    if (!active || !replyText.trim()) return;
    workbook.replyToComment(active.id, { author: author || 'Anon', text: replyText.trim() });
    setReplyText('');
  };

  return (
    <div className="side-panel" role="complementary" aria-label="Comments">
      <div className="side-panel-head">
        <strong>Comments</strong>
        <button onClick={onClose} title="Close comments panel">
          ×
        </button>
      </div>
      <div className="side-panel-body">
        <label>
          Your name
          <input value={author} onChange={(e) => saveAuthor(e.target.value)} />
        </label>

        <div className="comment-new">
          <div className="muted">Add to {addressToA1(selection)}</div>
          <textarea
            value={newText}
            placeholder="New comment…"
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
          />
          <button onClick={add} disabled={!newText.trim()}>
            Post
          </button>
        </div>

        <ul className="comment-list">
          {comments.length === 0 ? (
            <li className="muted">No comments yet.</li>
          ) : (
            comments.map((c) => (
              <li
                key={c.id}
                className={c.id === activeId ? 'active' : ''}
                onClick={() => setActiveId(c.id)}
              >
                <div className="comment-head">
                  <strong>{c.author}</strong>
                  <span className="muted"> · {addressToA1(c.address)}</span>
                  <button
                    style={{ float: 'right' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      workbook.removeComment(c.id);
                    }}
                    title="Delete comment"
                  >
                    ×
                  </button>
                </div>
                <div className="comment-body">{c.text}</div>
                {c.replies.length > 0 ? (
                  <ul className="comment-replies">
                    {c.replies.map((r) => (
                      <li key={r.id}>
                        <strong>{r.author}</strong>
                        <span className="muted"> · {relative(r.at)}</span>
                        <div>{r.text}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))
          )}
        </ul>

        {active ? (
          <div className="comment-reply">
            <div className="muted">Reply to {active.author}</div>
            <textarea
              value={replyText}
              placeholder="Your reply…"
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
            />
            <button onClick={reply} disabled={!replyText.trim()}>
              Reply
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function loadAuthor(): string {
  try {
    return localStorage.getItem('sheetly.commentAuthor') ?? '';
  } catch {
    return '';
  }
}

function relative(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
