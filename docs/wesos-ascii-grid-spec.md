# WesOS ASCII Grid Rendering System

## Purpose

Enable curses-style game rendering within the WesOS terminal on wshoffner.dev. The existing terminal handles line-based output (blog posts, Adventure, Z-Machine). This system adds a fixed-size character grid with per-cell styling and real-time input, supporting games like Rogue, Star Trek, Lunar Lander, Nethack, and custom prototypes.

---

## Architecture

Four layers, bottom to top. Each depends only on the layer below it.

```
Game Adapter (GridTest, RogueGame, StarTrekGame, etc.)
    ↓ uses
useAsciiGrid hook (imperative buffer → React state bridge)
    ↓ produces
AsciiGrid component (React renderer, DOM spans)
    ↓ reads
AsciiGridBuffer class (pure TypeScript, no React)
```

---

## Layer 1: AsciiGridBuffer

**File:** `src/lib/ascii-grid/AsciiGridBuffer.ts`

Pure TypeScript. Zero dependencies. Zero DOM awareness. Works anywhere JS runs. This is just a 2D array of cells with an imperative write API and row-level version tracking for efficient rendering.

### Types

```typescript
interface CellAttrs {
  fg?: string;       // color token -- arbitrary string, no enum
  bg?: string;       // consumer defines meaning via color map
  bold?: boolean;
  inverse?: boolean;
}

interface Cell {
  char: string;
  fg: string;
  bg: string;
  bold: boolean;
  inverse: boolean;
}

interface RowData {
  cells: Cell[];
  version: number;
}

interface GridSnapshot {
  rows: RowData[];
  width: number;
  height: number;
  cursorRow: number;
  cursorCol: number;
  cursorVisible: boolean;
  globalVersion: number;
}
```

### API

```typescript
class AsciiGridBuffer {
  constructor(width: number, height: number)

  // writing
  putChar(row: number, col: number, char: string, attrs?: CellAttrs): void
  putString(row: number, col: number, text: string, attrs?: CellAttrs): void
  fillRect(r1: number, c1: number, r2: number, c2: number, char: string, attrs?: CellAttrs): void
  drawBox(r1: number, c1: number, r2: number, c2: number, style?: 'single' | 'double'): void
  clear(attrs?: CellAttrs): void

  // reading
  getCell(row: number, col: number): Cell

  // cursor
  moveCursor(row: number, col: number): void
  setCursorVisible(visible: boolean): void

  // snapshotting
  snapshot(): GridSnapshot
}
```

### Row Version Tracking

Every row has a monotonic version counter. Any mutation to a cell in that row bumps the version. `snapshot()` returns RowData objects with structural sharing: if a row's version hasn't changed since the last snapshot, the same object reference is returned. This makes React.memo on row components a reference equality check, effectively free.

### Color Token Design

`fg` and `bg` are arbitrary strings, not a fixed enum. The buffer stores whatever token the game passes in (`"green"`, `"floor"`, `"gold"`, `"neon-cyan"`, anything). The mapping from token to actual visual style happens in the renderer via a color map. This means:

- Games define their own color vocabulary
- The same buffer can render with different themes by swapping the color map
- No coupling between game logic and CSS/Tailwind

Default `fg` is `"white"`. Default `bg` is `"bg"`.

---

## Layer 2: AsciiGrid Component

**File:** `src/components/AsciiGrid.tsx`

React component that renders a GridSnapshot as DOM spans. Two sub-components.

### AsciiGridRow (memoized)

Takes a single RowData. Renders as one `<div>` with fixed height containing coalesced `<span>` elements.

**Span coalescing:** Walk the cells left to right. Adjacent cells with identical `{fg, bg, bold, inverse}` merge into a single `<span>`. An 80-character row in Rogue (mostly floor tiles of the same color with scattered items and walls) typically collapses to 5-10 spans. 24 rows at ~8 spans each is ~192 DOM nodes for the entire game screen.

Memoization: `React.memo` with a comparator that checks `RowData.version`. Same version, same reference, no re-render.

### AsciiGrid (container)

Takes a GridSnapshot and a color map. Renders:

- A container `<div>` with monospace font, width set in `ch` units
- All rows via AsciiGridRow
- Cursor overlay: absolutely-positioned blinking `<span>` at the cursor position (when `cursorVisible` is true)

### Color Map

```typescript
interface ColorMap {
  [token: string]: {
    color: string;         // CSS color value for foreground
    background?: string;   // CSS color value for background
  }
}
```

The component maps color tokens from the snapshot to inline styles via this map. WesOS provides a default color map matching the site's neon palette:

```typescript
const wesOSColors: ColorMap = {
  white:   { color: '#e0e0e0' },
  green:   { color: '#39ff14' },
  cyan:    { color: '#00ffff' },
  magenta: { color: '#ff00ff' },
  yellow:  { color: '#facc15' },
  red:     { color: '#ef4444' },
  muted:   { color: '#8b949e' },
  bg:      { color: '#0a0a0f' },
}
```

Games can extend or override this by passing a merged map. Rogue might add `floor`, `wall`, `gold`, `potion` tokens with specific colors. The renderer applies styles from the map; unknown tokens fall back to `white` fg and transparent bg.

Styles are applied as inline styles on spans, not Tailwind classes. This avoids any dependency on the Tailwind build pipeline and keeps the grid self-contained.

---

## Layer 3: useAsciiGrid Hook

**File:** `src/lib/ascii-grid/useAsciiGrid.ts`

Bridges the imperative buffer to React's state model.

```typescript
function useAsciiGrid(width: number, height: number): {
  buffer: AsciiGridBuffer;
  snapshot: GridSnapshot;
  flush: () => void;
}
```

- Creates the buffer via `useRef` -- stable across renders, never recreated
- `flush()` calls `buffer.snapshot()` and sets the result as React state via `useState`
- Games mutate the buffer freely (imperative, synchronous), then call `flush()` once to trigger a single re-render
- Structural sharing in snapshots means only rows with changed versions cause AsciiGridRow to re-render

**Why flush() instead of auto-rendering:** A single game tick might call `putChar` 50 times (redrawing a moving character, updating a status bar, refreshing a map region). Auto-rendering on every mutation would thrash React. The explicit flush gives the game full control: do all your mutations, then render once.

---

## Layer 4: useGridInput Hook

**File:** `src/lib/ascii-grid/useGridInput.ts`

Handles keyboard input with three modes that cover the full range of terminal game input patterns.

### Input Modes

```typescript
type InputMode = 'realtime' | 'line' | 'prompt' | 'disabled';
```

**realtime:** Every keydown fires a callback immediately. Arrow keys, HJKL, all single keypresses are game actions. Used by: Rogue, Nethack, any game where every key matters. Arrow keys and other browser-default keys call `preventDefault()`.

**line:** Renders a visible text input below the grid. Player types a command, presses Enter, callback fires with the full string. Used by: Star Trek (type `phasers 500` while looking at the sector grid), Lunar Lander (enter thrust values).

**prompt:** Single-key response to a question. "Press any key to continue", "[Y/N]", "Choose a direction". One keypress fires callback and typically transitions back to another mode. Used by: inventory prompts, confirmation dialogs, "more" pagers.

**disabled:** Ignores all input. Used during animations or transitions.

### Key Normalization

```typescript
interface GridKeyEvent {
  key: string;      // normalized: 'up', 'down', 'left', 'right', 'enter', 'escape', 'a'-'z', etc.
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  raw: string;      // original event.key value
}
```

Maps `ArrowUp` to `up`, `ArrowDown` to `down`, etc. Lowercases alpha keys. Passes through everything else. Games receive a consistent event shape regardless of browser.

### API

```typescript
function useGridInput(options: {
  mode: InputMode;
  onKey?: (event: GridKeyEvent) => void;
  onLine?: (text: string) => void;
  onPromptKey?: (key: string) => void;
  containerRef: RefObject<HTMLDivElement>;
}): {
  lineValue: string;
  promptText: string;
  setPromptText: (text: string) => void;
  inputProps: object;        // spread onto hidden input/div element
}
```

### Implementation

- **realtime mode:** A hidden focusable `<div>` with `tabIndex={0}` captures keyboard events. Auto-focused when the game starts. This avoids the quirks of hidden `<input>` elements across browsers.
- **line mode:** A visible `<input>` element styled to match the terminal aesthetic, positioned below the grid.
- **prompt mode:** Same hidden div as realtime, but only fires once per keypress then waits.
- On mode switch, focus transfers to the appropriate element automatically.

### Mobile Considerations

Mobile browsers are unreliable with hidden focusable elements and keydown events. For Phase 1, grid-based games should display a "desktop recommended" note on touch devices. Phase 2 can add a virtual d-pad overlay for realtime mode and an on-screen keyboard trigger for line mode, but this is not required to validate the grid system.

---

## Cursor

CSS animation defined in `src/app/globals.css`:

```css
@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
.ascii-cursor-blink {
  animation: cursor-blink 1s step-end infinite;
}
```

The cursor is an absolutely-positioned `<span>` rendered by the AsciiGrid component at the cursor's row/col position. Uses the `ascii-cursor-blink` class when visible. Positioned using `ch` and `lh` units to align with the character grid. Games control cursor visibility and position through the buffer API.

---

## Test Harness: GridTest

**File:** `src/components/GridTest.tsx`

An interactive test game that exercises every part of the grid system before real games are built on it.

**Features:**
- A `@` character that moves with arrow keys (validates realtime input and putChar)
- Color palette rows showing every color token (validates color map and span rendering)
- Box-drawing test using `drawBox` with single-line Unicode chars (validates box drawing)
- Status bar at row 0 showing cursor position and current input mode (validates putString)
- Tab key cycles through input modes: realtime -> line -> prompt -> realtime (validates all input paths)
- Line mode: typed text renders on the bottom row of the grid (validates line input integration)
- Prompt mode: "Press any key..." message, captures one key, displays it (validates prompt input)
- `/quit` exits back to the terminal

Follows the existing WesOS game adapter pattern with `{ onGameEnd, scrollToBottom }` props.

### Terminal Integration

- Add `"gridtest"` to the `activeGame` union type in `Terminal.tsx`
- Import GridTest component, add rendering branch
- Add `play gridtest` and `gridtest` commands in `commands.tsx`
- Add to the games listing help text

---

## Game Adapter Pattern

Grid-based games follow the same integration pattern as existing WesOS games:

```typescript
interface GridGameProps {
  onGameEnd: () => void;
  scrollToBottom: () => void;
}
```

Each game component composes the grid system internally:
1. Call `useAsciiGrid(width, height)` to get buffer + snapshot + flush
2. Call `useGridInput(...)` to handle keyboard input
3. Render `<AsciiGrid snapshot={snapshot} colorMap={colors} />` plus any input elements from the hook
4. Game logic lives in the component: mutate the buffer, flush, respond to input
5. Exit condition calls `onGameEnd()` to return to the normal terminal prompt

Games may extend the default WesOS color map with game-specific tokens. Games may use a message log area below the grid (common in roguelikes) by rendering additional line-based output outside the grid component.

---

## Implementation Order

1. Create `src/lib/ascii-grid/` directory
2. `AsciiGridBuffer.ts` -- all buffer logic, pure TypeScript, no dependencies
3. `useAsciiGrid.ts` -- thin hook wrapping the buffer
4. `useGridInput.ts` -- input normalization and mode switching
5. `AsciiGrid.tsx` + `AsciiGridRow` -- renderer with span coalescing and color map
6. Cursor blink CSS in `globals.css`
7. `GridTest.tsx` -- test harness game
8. Wire into `Terminal.tsx` and `commands.tsx`
9. Dev server test: `npm run dev`, type `gridtest`
10. Visual verification: grid renders, colors display, `@` moves, modes switch, `/quit` exits
11. Regression check: existing games (Zork, Adventure, Wumpus, ELIZA, tic-tac-toe) still work

---

## Planned Games (Post Phase 1)

Once the grid system is validated via GridTest, games are implemented in this order based on complexity:

1. **Rogue** -- Proof of concept for real-time grid rendering. Full dungeon display, real-time movement, per-cell color. Exercises every capability of the grid system at its most demanding. If Rogue runs smooth, everything else is easy.
2. **Star Trek** -- Validates hybrid mode: a fixed sector grid rendered via the grid system with line-based command input below it. Tests grid + line input coexistence.
3. **Lunar Lander** -- Simpler grid usage (instrument readouts, altitude display). Palate cleanser between the complex implementations.
4. **Nethack** -- The most complex case. Extended ASCII, dense color usage, multi-modal input, message log, inventory screens. Victory lap for the system.
5. **TermLife** -- Conway's Game of Life, ported from the existing `tickTockBent/termlife` repo. Pure grid rendering showcase, no game input complexity.
6. **Custom prototypes** -- Original game designs published at bespoke endpoints (`/nodeborn`, etc.) using the same renderer.

---

## Performance Budget

Target: 60fps rendering for a full 80x24 grid update.

The system achieves this through:
- **Row-level memoization:** Only changed rows re-render. A typical game tick changes 2-5 rows.
- **Span coalescing:** 80 cells per row collapse to ~5-10 DOM spans via run-length encoding. A full screen is ~200 DOM nodes.
- **Explicit flush:** Games batch all mutations then trigger one render call. No per-mutation React re-renders.
- **Structural sharing:** Unchanged rows return the same object reference from snapshot, making React.memo comparisons O(1).

For context: a full-screen Nethack redraw (worst case, every cell changes) produces ~200-400 spans across 24 rows. React reconciles this in under 2ms on modern hardware. Real game ticks that change a few rows will be sub-millisecond.
