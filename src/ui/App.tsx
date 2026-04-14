import { useEffect, useMemo, useRef, useState } from 'react';
import { Workbook } from '../engine/workbook';
import { Grid } from '../grid/Grid';
import { Toolbar } from './Toolbar';
import { FormulaBar } from './FormulaBar';
import { SheetTabs } from './SheetTabs';
import { FindReplace } from './FindReplace';
import { ChartsPanel } from './ChartsPanel';
import { PivotPanel } from './PivotPanel';
import { CommentsPanel } from './CommentsPanel';
import { importCsv } from '../io/csv';
import { printSheet, downloadSheetCharts } from '../io/print';
import { downloadReadonlyBundle } from '../io/bundle';
import type { Address, RangeAddress } from '../engine/address';
import type { ThemeId } from '../grid/theme';

export function App() {
  const workbook = useMemo(() => Workbook.createDefault(), []);
  const [activeSheetId, setActiveSheetId] = useState(workbook.sheets[0]!.id);
  const [selection, setSelection] = useState<Address>({ row: 0, col: 0 });
  const [selectionRange, setSelectionRange] = useState<RangeAddress>({
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 },
  });
  const [themeId, setThemeId] = useState<ThemeId>('light');
  const [paintStyleId, setPaintStyleId] = useState<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [pivotsOpen, setPivotsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => workbook.subscribe(rerender), [workbook]);

  // Reflect the theme on <html> so CSS variables can follow.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  // Ctrl+F opens find/replace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sheet = workbook.getSheet(activeSheetId);

  const onFile = async (file: File) => {
    const text = await file.text();
    importCsv(workbook, sheet.id, text);
  };

  return (
    <div className="app">
      <Toolbar
        workbook={workbook}
        sheet={sheet}
        selection={selection}
        selectionRange={selectionRange}
        themeId={themeId}
        onThemeChange={setThemeId}
        painterActive={paintStyleId !== null}
        onStartPainter={setPaintStyleId}
        onImport={() => fileRef.current?.click()}
        onFind={() => setFindOpen(true)}
        onToggleCharts={() => setChartsOpen((v) => !v)}
        onTogglePivots={() => setPivotsOpen((v) => !v)}
        onOpenPivots={() => setPivotsOpen(true)}
        onToggleComments={() => setCommentsOpen((v) => !v)}
        onPrint={() => printSheet(workbook, sheet)}
        onPrintCharts={() => printSheet(workbook, sheet, { chartsOnly: true, includeCharts: true })}
        onDownloadCharts={() => downloadSheetCharts(workbook, sheet)}
        onExportBundle={() => downloadReadonlyBundle(workbook)}
        onToggleProtection={() => {
          if (sheet.protection?.enabled) {
            workbook.setProtection(sheet.id, undefined);
          } else {
            workbook.setProtection(sheet.id, {
              enabled: true,
              message: 'This sheet is protected. Unlock it to edit.',
            });
          }
        }}
      />
      <FormulaBar workbook={workbook} sheet={sheet} selection={selection} />
      <Grid
        workbook={workbook}
        sheet={sheet}
        selection={selection}
        onSelectionChange={setSelection}
        onRangeChange={setSelectionRange}
        onDropFiles={(files) => files[0] && onFile(files[0])}
        themeId={themeId}
        paintStyleId={paintStyleId}
        onPaintComplete={() => setPaintStyleId(null)}
      />
      <SheetTabs
        workbook={workbook}
        activeSheetId={activeSheetId}
        onSelect={setActiveSheetId}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {findOpen ? <FindReplace workbook={workbook} sheet={sheet} onClose={() => setFindOpen(false)} /> : null}
      {chartsOpen ? (
        <ChartsPanel workbook={workbook} sheet={sheet} onClose={() => setChartsOpen(false)} />
      ) : null}
      {pivotsOpen ? (
        <PivotPanel workbook={workbook} sheet={sheet} onClose={() => setPivotsOpen(false)} />
      ) : null}
      {commentsOpen ? (
        <CommentsPanel
          workbook={workbook}
          sheet={sheet}
          selection={selection}
          onClose={() => setCommentsOpen(false)}
        />
      ) : null}
    </div>
  );
}
