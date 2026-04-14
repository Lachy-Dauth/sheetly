import { useEffect, useMemo, useRef, useState } from 'react';
import { Workbook } from '../engine/workbook';
import { Grid } from '../grid/Grid';
import { Toolbar } from './Toolbar';
import { FormulaBar } from './FormulaBar';
import { SheetTabs } from './SheetTabs';
import { importCsv } from '../io/csv';
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
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => workbook.subscribe(rerender), [workbook]);

  // Reflect the theme on <html> so CSS variables can follow.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

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
    </div>
  );
}
