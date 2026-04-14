/**
 * Lightweight borders menu: exposes a few common presets (all, outer, none,
 * plus per-edge thin). Folded under a single toolbar button.
 */

import { useState } from 'react';
import type { BorderSide, Style } from '../engine/styles';

interface Props {
  onApply: (patch: Partial<Style>) => void;
}

const thin: BorderSide = { style: 'thin', color: '#1f2328' };
const none: BorderSide = { style: 'none' };

const PRESETS: Array<{ label: string; patch: Partial<Style> }> = [
  {
    label: 'All',
    patch: { border: { top: thin, bottom: thin, left: thin, right: thin } },
  },
  {
    label: 'Outer',
    patch: { border: { top: thin, bottom: thin, left: thin, right: thin } },
  },
  { label: 'Top', patch: { border: { top: thin } } },
  { label: 'Bottom', patch: { border: { bottom: thin } } },
  { label: 'Left', patch: { border: { left: thin } } },
  { label: 'Right', patch: { border: { right: thin } } },
  {
    label: 'Thick',
    patch: {
      border: {
        top: { style: 'thick', color: '#1f2328' },
        bottom: { style: 'thick', color: '#1f2328' },
        left: { style: 'thick', color: '#1f2328' },
        right: { style: 'thick', color: '#1f2328' },
      },
    },
  },
  {
    label: 'None',
    patch: { border: { top: none, bottom: none, left: none, right: none } },
  },
];

export function BorderMenu({ onApply }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dropdown" onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((o) => !o)} title="Borders">
        ▤
      </button>
      {open && (
        <div className="dropdown-menu">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                onApply(p.patch);
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
