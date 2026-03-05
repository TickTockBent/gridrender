# @ticktockbent/gridrender

ASCII grid rendering system for React. Provides a mutable buffer with snapshot-based diffing and efficient row-level React rendering.

## Install

```bash
npm install @ticktockbent/gridrender
```

## Usage

```tsx
import { useAsciiGrid, AsciiGrid, useGridInput } from '@ticktockbent/gridrender';
import '@ticktockbent/gridrender/styles.css'; // cursor blink animation

function MyGrid() {
  const { buffer, snapshot, flush } = useAsciiGrid(80, 24);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    buffer.drawBox(0, 0, 23, 79, 'single', { fg: 'green' });
    buffer.putString(1, 2, 'Hello, grid!', { fg: 'cyan', bold: true });
    flush();
  }, [buffer, flush]);

  const { containerProps } = useGridInput({
    mode: 'realtime',
    onKey: (event) => {
      // handle key events
    },
    containerRef,
  });

  return (
    <div ref={containerRef} {...containerProps}>
      <AsciiGrid snapshot={snapshot} />
    </div>
  );
}
```

## API

### `AsciiGridBuffer`

Mutable grid buffer with methods:

- `putChar(row, col, char, attrs?)` - write a single character
- `putString(row, col, text, attrs?)` - write a string
- `fillRect(r1, c1, r2, c2, char, attrs?)` - fill a rectangular region
- `drawBox(r1, c1, r2, c2, style?, attrs?)` - draw a box (`'single'` or `'double'`)
- `clear(attrs?)` - clear the entire grid
- `getCell(row, col)` - read a cell
- `moveCursor(row, col)` - move the cursor position
- `setCursorVisible(visible)` - show/hide the cursor
- `snapshot()` - produce an immutable snapshot with structural sharing

### `useAsciiGrid(width, height)`

React hook returning `{ buffer, snapshot, flush }`.

### `useGridInput(options)`

Input handling hook supporting `'realtime'`, `'line'`, `'prompt'`, and `'disabled'` modes.

### `<AsciiGrid snapshot colorMap? />`

React component that renders a `GridSnapshot`. Uses row-level memoization via snapshot versioning. Default color map: `wesOSColors`.

### `CellAttrs`

```ts
{ fg?: string; bg?: string; bold?: boolean; inverse?: boolean }
```

Color tokens are resolved via a `ColorMap` passed to `<AsciiGrid>`.

## License

MIT
