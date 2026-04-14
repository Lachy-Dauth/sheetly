# Sheetly

A browser-based spreadsheet application with CSV import/export and a comprehensive formula engine. Built to mirror the core Excel experience: formulas, formatting, tables, charts, and keyboard-driven editing.

## Features

### File I/O
- Import `.csv` and `.tsv` with configurable delimiter, quoting, and encoding
- Export current sheet or entire workbook as `.csv`
- Autosave to local storage; export/import workbook state as JSON
- Drag-and-drop file import

### Formulas & Functions
Over 150 built-in functions across the standard Excel categories:

- **Math & Trig** — `SUM`, `PRODUCT`, `ROUND`, `MOD`, `ABS`, `SQRT`, `POWER`, `EXP`, `LN`, `LOG`, `LOG10`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `DEGREES`, `RADIANS`, `PI`, `RAND`, `RANDBETWEEN`, `CEILING`, `FLOOR`, `INT`, `TRUNC`, `SIGN`, `GCD`, `LCM`, `SUMIF`, `SUMIFS`, `SUMPRODUCT`
- **Statistical** — `AVERAGE`, `AVERAGEIF`, `AVERAGEIFS`, `MEDIAN`, `MODE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `STDEV`, `STDEVP`, `VAR`, `VARP`, `PERCENTILE`, `QUARTILE`, `RANK`, `LARGE`, `SMALL`, `CORREL`, `COVAR`, `FORECAST`, `TREND`, `SLOPE`, `INTERCEPT`
- **Logical** — `IF`, `IFS`, `IFERROR`, `IFNA`, `AND`, `OR`, `NOT`, `XOR`, `SWITCH`, `TRUE`, `FALSE`
- **Text** — `CONCAT`, `CONCATENATE`, `TEXTJOIN`, `LEFT`, `RIGHT`, `MID`, `LEN`, `LOWER`, `UPPER`, `PROPER`, `TRIM`, `SUBSTITUTE`, `REPLACE`, `FIND`, `SEARCH`, `TEXT`, `VALUE`, `REPT`, `EXACT`, `CLEAN`, `CHAR`, `CODE`, `SPLIT`, `REGEXMATCH`, `REGEXEXTRACT`, `REGEXREPLACE`
- **Date & Time** — `TODAY`, `NOW`, `DATE`, `TIME`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `WEEKDAY`, `WEEKNUM`, `EOMONTH`, `EDATE`, `DATEDIF`, `DAYS`, `NETWORKDAYS`, `WORKDAY`, `DATEVALUE`, `TIMEVALUE`
- **Lookup & Reference** — `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `XMATCH`, `CHOOSE`, `OFFSET`, `INDIRECT`, `ROW`, `COLUMN`, `ROWS`, `COLUMNS`, `TRANSPOSE`, `FILTER`, `SORT`, `UNIQUE`, `HYPERLINK`
- **Financial** — `PMT`, `PV`, `FV`, `NPER`, `RATE`, `NPV`, `IRR`, `MIRR`, `IPMT`, `PPMT`, `SLN`, `DB`, `DDB`
- **Information** — `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISERROR`, `ISNA`, `ISLOGICAL`, `ISEVEN`, `ISODD`, `TYPE`, `N`, `NA`, `CELL`, `INFO`
- **Array / Dynamic** — spilled arrays, `SEQUENCE`, `RANDARRAY`, `LAMBDA`, `LET`, `MAP`, `REDUCE`, `BYROW`, `BYCOL`

Formulas support absolute/relative references (`$A$1`, `A$1`, `$A1`), named ranges, cross-sheet references (`Sheet2!A1:B10`), and circular-reference detection with iterative calculation.

### Styling & Formatting
- Fonts: family, size, bold, italic, underline, strikethrough, color
- Fill color, gradient fills, pattern fills
- Borders: per-edge style (thin / medium / thick / dashed / dotted / double), color
- Horizontal and vertical alignment, text wrap, text rotation, indent
- Number formats: general, number, currency, accounting, percent, scientific, fraction, date, time, custom (`#,##0.00;[Red](#,##0.00)`)
- Merge and center, unmerge
- Row height and column width (drag, double-click to autofit)
- Conditional formatting: value rules, color scales, data bars, icon sets, formula-based rules
- Cell styles and reusable named styles
- Themes (light, dark, high-contrast, custom palette)

### Tables
- Convert any range to a structured table
- Table styles with alternating row bands, header and total rows
- Column filters and multi-column sort
- Structured references (`Table1[Column1]`)
- Auto-expand on new rows
- Slicers for quick filtering

### Data Tools
- Find and replace with regex
- Sort (single and multi-key) and filter
- Data validation (list, number range, date range, text length, custom formula)
- Remove duplicates
- Text to columns
- Flash fill
- Freeze rows and columns
- Group and outline, subtotals
- Pivot tables with drag-and-drop field layout

### Charts
- Column, bar, line, area, pie, doughnut, scatter, bubble, radar, combo
- Multi-series, secondary axis, trendlines, error bars
- Chart titles, axis labels, legends, data labels
- Sparklines (line, column, win/loss) inline in cells

### Editing & Navigation
- Keyboard shortcuts matching Excel (`Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `F2`, `F4`, `Ctrl+;`, `Ctrl+Shift+L`, `Ctrl+Arrow`, `Shift+Space`, `Ctrl+Space`, etc.)
- Undo/redo history (unlimited within session)
- Multi-cell selection, range selection, column/row selection, non-contiguous selection with `Ctrl+click`
- Fill handle with smart series detection
- Cut / copy / paste with paste-special (values, formulas, formats, transpose)
- Insert, delete, hide, unhide rows and columns
- Multiple sheets per workbook with reorder, rename, color-code, duplicate
- Comments and threaded replies per cell

### Collaboration & Sharing
- Export to CSV, JSON, or printable HTML
- Shareable read-only link via exported bundle
- Per-sheet protection and locked cells

## Getting Started

```bash
git clone https://github.com/<your-username>/sheetly.git
cd sheetly
npm install
npm run dev
```

Open http://localhost:5173 in a browser.

### Build

```bash
npm run build
npm run preview
```

### Test

```bash
npm run test
npm run test:e2e
```

## Usage

1. **Create a sheet** — launch the app and start typing in any cell.
2. **Import CSV** — drag a `.csv` file onto the grid, or use `File → Import CSV`.
3. **Enter a formula** — start with `=`, e.g. `=SUM(A1:A10)`.
4. **Format a range** — select cells and use the toolbar or `Ctrl+1` for the format dialog.
5. **Make a table** — select a range and press `Ctrl+T`.
6. **Export** — `File → Export → CSV` (active sheet) or `Workbook (JSON)`.

## Tech Stack

- TypeScript
- React for the UI shell
- Custom virtualized canvas grid (handles 1M+ rows)
- Custom formula parser and dependency-graph evaluator
- Vite build tooling
- Vitest + Playwright for tests

## Project Status

Active development. See [plan.md](./plan.md) for roadmap and milestones.

## License

MIT
