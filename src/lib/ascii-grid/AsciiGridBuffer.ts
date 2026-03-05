// ─── Types ───────────────────────────────────────────────────────────────────

export interface CellAttrs {
  fg?: string;
  bg?: string;
  bold?: boolean;
  inverse?: boolean;
}

export interface Cell {
  char: string;
  fg: string;
  bg: string;
  bold: boolean;
  inverse: boolean;
}

export interface RowData {
  cells: Cell[];
  version: number;
}

export interface GridSnapshot {
  rows: RowData[];
  width: number;
  height: number;
  cursorRow: number;
  cursorCol: number;
  cursorVisible: boolean;
  globalVersion: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FG = 'white';
const DEFAULT_BG = 'bg';

const BOX_SINGLE = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
};

const BOX_DOUBLE = {
  tl: '╔', tr: '╗', bl: '╚', br: '╝',
  h: '═', v: '║',
};

// ─── Buffer ──────────────────────────────────────────────────────────────────

function makeCell(char = ' ', fg = DEFAULT_FG, bg = DEFAULT_BG, bold = false, inverse = false): Cell {
  return { char, fg, bg, bold, inverse };
}

export class AsciiGridBuffer {
  readonly width: number;
  readonly height: number;

  private rows: RowData[];
  private prevSnapshot: RowData[] | null = null;
  private globalVersion = 0;

  private cursorRow = 0;
  private cursorCol = 0;
  private cursorVisible = true;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = [];
    for (let r = 0; r < height; r++) {
      const cells: Cell[] = [];
      for (let c = 0; c < width; c++) {
        cells.push(makeCell());
      }
      this.rows.push({ cells, version: 0 });
    }
  }

  // ── Writing ──────────────────────────────────────────────────────────────

  putChar(row: number, col: number, char: string, attrs?: CellAttrs): void {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;
    const cell = this.rows[row].cells[col];
    cell.char = char;
    cell.fg = attrs?.fg ?? DEFAULT_FG;
    cell.bg = attrs?.bg ?? DEFAULT_BG;
    cell.bold = attrs?.bold ?? false;
    cell.inverse = attrs?.inverse ?? false;
    this.bumpRow(row);
  }

  putString(row: number, col: number, text: string, attrs?: CellAttrs): void {
    for (let i = 0; i < text.length; i++) {
      const c = col + i;
      if (c >= this.width) break;
      this.putChar(row, c, text[i], attrs);
    }
  }

  fillRect(r1: number, c1: number, r2: number, c2: number, char: string, attrs?: CellAttrs): void {
    const minR = Math.max(0, Math.min(r1, r2));
    const maxR = Math.min(this.height - 1, Math.max(r1, r2));
    const minC = Math.max(0, Math.min(c1, c2));
    const maxC = Math.min(this.width - 1, Math.max(c1, c2));
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = this.rows[r].cells[c];
        cell.char = char;
        cell.fg = attrs?.fg ?? DEFAULT_FG;
        cell.bg = attrs?.bg ?? DEFAULT_BG;
        cell.bold = attrs?.bold ?? false;
        cell.inverse = attrs?.inverse ?? false;
      }
      this.bumpRow(r);
    }
  }

  drawBox(r1: number, c1: number, r2: number, c2: number, style: 'single' | 'double' = 'single', attrs?: CellAttrs): void {
    const box = style === 'double' ? BOX_DOUBLE : BOX_SINGLE;
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    // corners
    this.putChar(minR, minC, box.tl, attrs);
    this.putChar(minR, maxC, box.tr, attrs);
    this.putChar(maxR, minC, box.bl, attrs);
    this.putChar(maxR, maxC, box.br, attrs);

    // horizontal edges
    for (let c = minC + 1; c < maxC; c++) {
      this.putChar(minR, c, box.h, attrs);
      this.putChar(maxR, c, box.h, attrs);
    }

    // vertical edges
    for (let r = minR + 1; r < maxR; r++) {
      this.putChar(r, minC, box.v, attrs);
      this.putChar(r, maxC, box.v, attrs);
    }
  }

  clear(attrs?: CellAttrs): void {
    const fg = attrs?.fg ?? DEFAULT_FG;
    const bg = attrs?.bg ?? DEFAULT_BG;
    const bold = attrs?.bold ?? false;
    const inverse = attrs?.inverse ?? false;
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const cell = this.rows[r].cells[c];
        cell.char = ' ';
        cell.fg = fg;
        cell.bg = bg;
        cell.bold = bold;
        cell.inverse = inverse;
      }
      this.bumpRow(r);
    }
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  getCell(row: number, col: number): Cell {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
      return makeCell();
    }
    return { ...this.rows[row].cells[col] };
  }

  // ── Cursor ───────────────────────────────────────────────────────────────

  moveCursor(row: number, col: number): void {
    this.cursorRow = Math.max(0, Math.min(this.height - 1, row));
    this.cursorCol = Math.max(0, Math.min(this.width - 1, col));
  }

  setCursorVisible(visible: boolean): void {
    this.cursorVisible = visible;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  snapshot(): GridSnapshot {
    this.globalVersion++;
    const prev = this.prevSnapshot;
    const snapshotRows: RowData[] = new Array(this.height);

    for (let r = 0; r < this.height; r++) {
      const row = this.rows[r];
      // Structural sharing: if the version matches the previous snapshot, reuse the reference
      if (prev && prev[r] && prev[r].version === row.version) {
        snapshotRows[r] = prev[r];
      } else {
        // Deep copy cells so the snapshot is immutable
        const cellsCopy: Cell[] = new Array(this.width);
        for (let c = 0; c < this.width; c++) {
          const src = row.cells[c];
          cellsCopy[c] = { char: src.char, fg: src.fg, bg: src.bg, bold: src.bold, inverse: src.inverse };
        }
        snapshotRows[r] = { cells: cellsCopy, version: row.version };
      }
    }

    this.prevSnapshot = snapshotRows;

    return {
      rows: snapshotRows,
      width: this.width,
      height: this.height,
      cursorRow: this.cursorRow,
      cursorCol: this.cursorCol,
      cursorVisible: this.cursorVisible,
      globalVersion: this.globalVersion,
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private bumpRow(row: number): void {
    this.rows[row].version++;
  }
}
