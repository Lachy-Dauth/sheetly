import { useState } from 'react';
import type { Workbook } from '../engine/workbook';
import type { Sheet } from '../engine/sheet';
import { findAll, replaceAll } from '../engine/data-ops';

interface Props {
  workbook: Workbook;
  sheet: Sheet;
  onClose: () => void;
}

/** Simple modal pane for find + replace on the active sheet. */
export function FindReplace({ workbook, sheet, onClose }: Props) {
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [status, setStatus] = useState('');

  const runFind = () => {
    if (!pattern) return;
    try {
      const hits = findAll(sheet, { pattern, regex, caseSensitive, wholeCell });
      setStatus(`${hits.length} match${hits.length === 1 ? '' : 'es'}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Find failed');
    }
  };
  const runReplace = () => {
    if (!pattern) return;
    try {
      const n = replaceAll(workbook, sheet, {
        pattern,
        replacement,
        regex,
        caseSensitive,
        wholeCell,
      });
      setStatus(`${n} replaced`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Replace failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Find and replace">
        <h3>Find &amp; Replace</h3>
        <label>
          Find
          <input autoFocus value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </label>
        <label>
          Replace with
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </label>
        <div className="row">
          <label>
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Regex
          </label>
          <label>
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Match case
          </label>
          <label>
            <input type="checkbox" checked={wholeCell} onChange={(e) => setWholeCell(e.target.checked)} /> Whole cell
          </label>
        </div>
        <div className="row">
          <button onClick={runFind}>Find all</button>
          <button onClick={runReplace}>Replace all</button>
          <button onClick={onClose}>Close</button>
        </div>
        {status ? <div className="status">{status}</div> : null}
      </div>
    </div>
  );
}
