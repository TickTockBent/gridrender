# gridrender Upstream Changes

Bring the `@ticktockbent/gridrender` package up to parity with the rendering architecture in `wshoffner.dev`. The in-tree version now uses CSS border overlays instead of Unicode box-drawing characters, and a `<pre>`-based text layer instead of per-row `<div>`s. These changes need to be ported into the library while preserving its existing API conventions (`CellAttrs`, `ColorMap`, inline styles).

## 1. `src/lib/ascii-grid/AsciiGridBuffer.ts`

### Add BoxDecoration types

Add after the existing `GridSnapshot` interface:

```ts
export type BoxStyle = "single" | "double";

export interface BoxDecoration {
  id: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  style: BoxStyle;
  fg: string;
}
```

Note: `fg` is `string` (not a union type) to match this repo's convention of string-based color tokens resolved via `ColorMap`.

### Extend GridSnapshot

Add two fields to `GridSnapshot`:

```ts
export interface GridSnapshot {
  // ...existing fields...
  decorations: BoxDecoration[];
  decorationVersion: number;
}
```

### Add private state to AsciiGridBuffer

```ts
private decorations: BoxDecoration[] = [];
private decorationVersion = 0;
private nextDecorationId = 0;
private lastSnapshotDecorations: BoxDecoration[] | null = null;
private lastSnapshotDecorationVersion = -1;
```

### Remove BOX_SINGLE and BOX_DOUBLE constants

Delete the `BOX_SINGLE` and `BOX_DOUBLE` objects entirely. They are no longer used.

### Rewrite drawBox()

Replace the current `drawBox` implementation. The new version:
1. Writes **space characters** to all border cell positions (reserves the space in the cell grid)
2. Pushes a `BoxDecoration` to the decorations array
3. Bumps affected row versions

```ts
drawBox(r1: number, c1: number, r2: number, c2: number, style: BoxStyle = 'single', attrs?: CellAttrs): void {
  const rMin = Math.max(0, Math.min(r1, r2));
  const rMax = Math.min(this.height - 1, Math.max(r1, r2));
  const cMin = Math.max(0, Math.min(c1, c2));
  const cMax = Math.min(this.width - 1, Math.max(c1, c2));

  // Write spaces to all border cell positions to reserve space
  for (let c = cMin; c <= cMax; c++) {
    if (rMin >= 0 && rMin < this.height && c >= 0 && c < this.width) {
      this.rows[rMin].cells[c] = makeCell();
    }
    if (rMax >= 0 && rMax < this.height && c >= 0 && c < this.width) {
      this.rows[rMax].cells[c] = makeCell();
    }
  }
  this.bumpRow(rMin);
  if (rMax !== rMin) this.bumpRow(rMax);

  for (let r = rMin + 1; r < rMax; r++) {
    if (cMin >= 0 && cMin < this.width) {
      this.rows[r].cells[cMin] = makeCell();
    }
    if (cMax >= 0 && cMax < this.width) {
      this.rows[r].cells[cMax] = makeCell();
    }
    this.bumpRow(r);
  }

  this.decorations.push({
    id: this.nextDecorationId++,
    r1: rMin,
    c1: cMin,
    r2: rMax,
    c2: cMax,
    style,
    fg: attrs?.fg ?? DEFAULT_FG,
  });
  this.decorationVersion++;
}
```

The method signature stays the same (callers are not affected), but the `attrs` parameter is now only used to extract the `fg` color token for the CSS border. The `bg`, `bold`, and `inverse` fields in attrs are ignored for box decorations.

### Add clearDecorations()

```ts
clearDecorations(): void {
  this.decorations = [];
  this.decorationVersion++;
}
```

### Modify clear()

Add decoration clearing at the end of the existing `clear()` method:

```ts
clear(attrs?: CellAttrs): void {
  // ...existing cell-clearing logic...
  this.decorations = [];
  this.decorationVersion++;
}
```

### Modify snapshot()

Add structural sharing for decorations, and include them in the returned object:

```ts
snapshot(): GridSnapshot {
  // ...existing row snapshot logic...

  let snapshotDecorations: BoxDecoration[];
  if (this.lastSnapshotDecorationVersion === this.decorationVersion && this.lastSnapshotDecorations) {
    snapshotDecorations = this.lastSnapshotDecorations;
  } else {
    snapshotDecorations = [...this.decorations];
    this.lastSnapshotDecorations = snapshotDecorations;
    this.lastSnapshotDecorationVersion = this.decorationVersion;
  }

  return {
    // ...existing fields...
    decorations: snapshotDecorations,
    decorationVersion: this.decorationVersion,
  };
}
```

### Update exports

Add `BoxStyle` and `BoxDecoration` to the exports from `src/lib/ascii-grid/index.ts` and `src/index.ts`.

---

## 2. `src/components/AsciiGrid.tsx`

### Switch to `<pre>`-based text layer

Replace the per-row `<div>` rendering with a single `<pre>` element containing Fragment-based rows separated by `\n`. This creates a single inline formatting context, better text selection, and cleaner DOM.

### Rewrite AsciiGridRow

The row component should output a Fragment (spans + newline) instead of a `<div>`:

```tsx
interface AsciiGridRowProps {
  rowData: RowData;
  colorMap: ColorMap;
  isLast: boolean;
}

const AsciiGridRow = memo(function AsciiGridRow({ rowData, colorMap, isLast }: AsciiGridRowProps) {
  const runs = coalesceRow(rowData.cells);
  return (
    <>
      {runs.map((run, i) => {
        const fgToken = run.inverse ? run.bg : run.fg;
        const bgToken = run.inverse ? run.fg : run.bg;
        const fgEntry = colorMap[fgToken];
        const bgEntry = colorMap[bgToken];
        const fgColor = fgEntry?.color ?? FALLBACK_FG;
        const bgColor = bgEntry?.color ?? bgEntry?.background ?? 'transparent';

        const style: React.CSSProperties = {
          color: fgColor,
          backgroundColor: bgColor !== 'transparent' ? bgColor : undefined,
          fontWeight: run.bold ? 'bold' : undefined,
        };

        return <span key={i} style={style}>{run.text}</span>;
      })}
      {!isLast && "\n"}
    </>
  );
}, (prev, next) =>
  prev.rowData.version === next.rowData.version &&
  prev.colorMap === next.colorMap &&
  prev.isLast === next.isLast
);
```

### Add BoxOverlay component

New memoized component that renders CSS-bordered divs for each `BoxDecoration`:

```tsx
interface BoxOverlayProps {
  decorations: BoxDecoration[];
  decorationVersion: number;
  colorMap: ColorMap;
}

const BoxOverlay = memo(function BoxOverlay({ decorations, colorMap }: BoxOverlayProps) {
  return (
    <>
      {decorations.map((dec) => {
        const borderWidth = dec.style === 'double' ? '3px double' : '1px solid';
        const colorEntry = colorMap[dec.fg];
        const borderColor = colorEntry?.color ?? FALLBACK_FG;

        return (
          <div
            key={dec.id}
            style={{
              position: 'absolute',
              left: `${dec.c1}ch`,
              top: `${dec.r1}lh`,
              width: `${dec.c2 - dec.c1 + 1}ch`,
              height: `${dec.r2 - dec.r1 + 1}lh`,
              border: `${borderWidth} ${borderColor}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </>
  );
}, (prev, next) => prev.decorationVersion === next.decorationVersion && prev.colorMap === next.colorMap);
```

Note: uses `lh` units (matching this repo's existing convention) instead of `em`.

### Rewrite main AsciiGrid component

```tsx
export function AsciiGrid({ snapshot, colorMap = wesOSColors }: AsciiGridProps) {
  const bgEntry = colorMap['bg'];
  const bgColor = bgEntry?.color ?? '#0a0a0f';

  return (
    <div
      style={{
        fontFamily: 'monospace',
        width: `${snapshot.width}ch`,
        backgroundColor: bgColor,
        position: 'relative',
        lineHeight: 1,
        fontSize: '14px',
      }}
    >
      <pre style={{ whiteSpace: 'pre', lineHeight: 1, letterSpacing: 0, margin: 0 }}>
        {snapshot.rows.map((rowData, r) => (
          <AsciiGridRow
            key={r}
            rowData={rowData}
            colorMap={colorMap}
            isLast={r === snapshot.rows.length - 1}
          />
        ))}
      </pre>
      <BoxOverlay
        decorations={snapshot.decorations}
        decorationVersion={snapshot.decorationVersion}
        colorMap={colorMap}
      />
      {snapshot.cursorVisible && (
        <span
          className="ascii-cursor-blink"
          style={{
            position: 'absolute',
            left: `${snapshot.cursorCol}ch`,
            top: `${snapshot.cursorRow}lh`,
            width: '1ch',
            height: '1lh',
            backgroundColor: '#e0e0e0',
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        />
      )}
    </div>
  );
}
```

---

## 3. Cleanup

### Delete `src/app/globals.css`

This file duplicates `styles.css` and serves no purpose in a library package. The cursor blink animation is already in `styles.css` which is the exported stylesheet.

---

## 4. Files NOT changed

- `src/lib/ascii-grid/useAsciiGrid.ts` -- snapshot shape changes are inferred by TS
- `src/lib/ascii-grid/useGridInput.ts` -- completely decoupled from rendering
- `src/components/GridTest.tsx` -- calls `buffer.drawBox()` which keeps the same signature
- `package.json` -- no dependency changes needed
- `tsconfig.json` -- no changes needed
- `styles.css` -- cursor blink animation already exists

---

## 5. Verification

1. `npm run typecheck` -- no type errors
2. `npm run build` -- produces `dist/` with declarations
3. GridTest should render boxes with pixel-perfect CSS borders instead of broken Unicode glyphs
4. Color tokens in `BoxDecoration.fg` resolve through `ColorMap` just like text colors
5. Text selection works across the `<pre>` content
6. Cursor blink still works with `lh` positioning
