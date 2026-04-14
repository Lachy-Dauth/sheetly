# Sheetly — Implementation Plan

A staged build plan for a browser-based spreadsheet app with CSV I/O and Excel-parity features. Each milestone is independently shippable; later milestones build on the data model and rendering established early on.

---

## M0 — Project Scaffolding

**Goal:** working dev environment, lint/type/test pipeline, empty app shell.

- Initialise Vite + TypeScript + React project
- ESLint, Prettier, `tsconfig` with strict mode
- Vitest for unit tests, Playwright for e2e
- Directory layout: `src/engine` (formula + model), `src/grid` (renderer), `src/ui` (React), `src/io` (import/export)
- GitHub Actions: lint, typecheck, test on PR

---

## M1 — Core Data Model

**Goal:** in-memory workbook that can represent cells, sheets, and ranges.

- `Workbook` → `Sheet[]` → sparse `Map<cellKey, Cell>` (sparse because most sheets are mostly empty)
- `Cell` carries raw input, parsed value, computed value, style ref, and metadata (comment, validation)
- Address parsing: `A1` ↔ `{row, col}`, range parsing `A1:B10`, cross-sheet `Sheet1!A1`
- Column/row metadata: width, height, hidden, frozen
- Undo/redo via command pattern — every mutation is a reversible op
- Unit tests for address math, range iteration, sparse-map semantics

---

## M2 — Grid Renderer

**Goal:** performant grid capable of rendering 1M rows.

- Canvas-based virtualised grid; only visible cells drawn
- Row/column headers, resize handles, frozen panes
- Selection model: active cell, range selection, multi-range (`Ctrl+click`), column/row selection
- Scrollbars, `Ctrl+Arrow` navigation, `Ctrl+Home`/`End`
- Inline cell editor (overlay `<input>`/`<textarea>` above the canvas)
- Fill handle UI (drag to extend)
- Perf budget: 60fps scroll at 100k populated cells

---

## M3 — Formula Engine

**Goal:** evaluate formulas with correct semantics and recalculation.

- Tokeniser → Pratt parser → AST
- Supports operators `+ - * / % ^ & = <> < > <= >=`, unary `+`/`-`, parentheses, ranges, sheet refs, absolute refs
- Dependency graph: cell → cells it depends on; topological recalc on change
- Circular reference detection; optional iterative calculation with max-iterations and tolerance
- Error propagation: `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#N/A`, `#NUM!`, `#NULL!`, `#CIRC!`
- Function registry with type coercion helpers
- Implement batch 1: math, logical, text, basic stats (see README for full list)
- Implement batch 2: date/time, lookup (`VLOOKUP`, `INDEX`, `MATCH`, `XLOOKUP`), information
- Implement batch 3: financial, advanced stats
- Implement batch 4: dynamic arrays + spill semantics, `LAMBDA`, `LET`, `MAP`, `REDUCE`
- Named ranges

**Testing:** golden-file tests against a corpus of Excel-computed results.

---

## M4 — CSV Import / Export

**Goal:** lossless round-trip for CSV; sensible defaults for edge cases.

- RFC 4180 parser with configurable delimiter (`,`, `;`, `\t`, `|`), quote char, escape, header row
- Encoding detection (UTF-8 BOM, UTF-16); fallback prompt
- Type inference on import (numbers, dates, booleans) with opt-out
- Export active sheet as CSV; full workbook as JSON
- Drag-and-drop import onto grid
- Streaming parser for files >50MB

---

## M5 — Formatting & Styling

**Goal:** visual parity with Excel's Home tab.

- Style model: styles stored once, referenced by cells (dedup)
- Font (family, size, weight, italic, underline, strikethrough, color)
- Fill (solid, gradient, pattern) and borders (per-edge style + color)
- Alignment (horizontal, vertical, wrap, rotation, indent)
- Number formats: built-in presets + custom format strings (`#,##0.00;[Red]...`)
- Merge / unmerge cells
- Row height, column width, autofit on double-click
- Format painter
- Theme system with light/dark/high-contrast

---

## M6 — Tables & Structured Data

- Convert range → structured `Table` object with header/total rows
- Auto-expand on edit adjacent
- Banded row styling, table style presets
- Column filters (checkbox list, condition, search)
- Structured references in formulas (`Table1[Col]`, `[@Col]`)
- Slicers

---

## M7 — Conditional Formatting

- Rule types: cell-value, top/bottom, above/below average, duplicate, formula
- Visual rule types: color scales (2- and 3-stop), data bars, icon sets
- Priority ordering, stop-if-true
- Live preview in rule editor

---

## M8 — Data Tools

- Find and replace with regex, match case, whole cell, within selection / sheet / workbook
- Sort: single-key, multi-key, custom list
- Filter: per-column, auto-updates with data
- Data validation: list, number/date range, text length, custom formula; error styles
- Remove duplicates, text-to-columns, flash fill
- Group/outline, subtotals
- Freeze panes

---

## M9 — Charts & Sparklines

- Chart engine using a lightweight SVG renderer
- Chart types: column, bar, line, area, pie, doughnut, scatter, bubble, radar, combo
- Multi-series, secondary axis, trendlines (linear, poly, exp, log), error bars
- Legend, axis labels, data labels, titles
- Inline sparklines in cells (line, column, win/loss)

---

## M10 — Pivot Tables

- Pivot cache built from source range/table
- Drag-and-drop field layout (rows, columns, values, filters)
- Aggregations: sum, count, avg, min, max, stdev, var, distinct count
- Grouping (date grouping by year/quarter/month; number ranges)
- Drill-down to source rows

---

## M11 — Collaboration Hooks

- Per-sheet protection (locked cells, formulas hidden)
- Comments + threaded replies, anchored to cells
- Export printable HTML and PDF (via browser print)
- Shareable read-only workbook bundle

---

## M12 — Performance Pass

- Profile hot paths: parsing, recalc, render
- Incremental recalc (only downstream of changes)
- Web Worker for parse + recalc so UI stays responsive
- Lazy style/format resolution per visible cell

---

## Cross-Cutting Concerns

- **Accessibility:** ARIA grid roles on overlay layer, keyboard-only operation for every feature, screen-reader announcement of active cell value and address
- **Keyboard shortcuts:** match Excel defaults; customisable map stored in settings
- **Error boundaries** around chart renderer, formula parser, CSV parser
- **Telemetry:** opt-in anonymous perf metrics
- **Docs:** in-app `?` overlay listing shortcuts; formula reference searchable from the function bar

---

## Out of Scope (for now)

- Real-time multi-user editing (requires server + CRDT)
- Native `.xlsx` round-trip (needs OOXML + ZIP + shared strings; planned as a follow-up)
- Macros / VBA (`LAMBDA` covers most scripting needs)
- Power Query
