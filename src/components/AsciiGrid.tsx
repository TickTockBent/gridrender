import React, { memo } from 'react';
import type { GridSnapshot, RowData, Cell } from '../lib/ascii-grid/AsciiGridBuffer';

// ─── Color Map ───────────────────────────────────────────────────────────────

export interface ColorMap {
  [token: string]: {
    color: string;
    background?: string;
  };
}

export const wesOSColors: ColorMap = {
  white:   { color: '#e0e0e0' },
  green:   { color: '#39ff14' },
  cyan:    { color: '#00ffff' },
  magenta: { color: '#ff00ff' },
  yellow:  { color: '#facc15' },
  red:     { color: '#ef4444' },
  muted:   { color: '#8b949e' },
  bg:      { color: '#0a0a0f' },
};

const FALLBACK_FG = '#e0e0e0';

// ─── Span Coalescing ─────────────────────────────────────────────────────────

interface SpanRun {
  text: string;
  fg: string;
  bg: string;
  bold: boolean;
  inverse: boolean;
}

function coalesceRow(cells: Cell[]): SpanRun[] {
  if (cells.length === 0) return [];

  const runs: SpanRun[] = [];
  let current: SpanRun = {
    text: cells[0].char,
    fg: cells[0].fg,
    bg: cells[0].bg,
    bold: cells[0].bold,
    inverse: cells[0].inverse,
  };

  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i];
    if (
      cell.fg === current.fg &&
      cell.bg === current.bg &&
      cell.bold === current.bold &&
      cell.inverse === current.inverse
    ) {
      current.text += cell.char;
    } else {
      runs.push(current);
      current = {
        text: cell.char,
        fg: cell.fg,
        bg: cell.bg,
        bold: cell.bold,
        inverse: cell.inverse,
      };
    }
  }
  runs.push(current);
  return runs;
}

// ─── Row Component ───────────────────────────────────────────────────────────

interface AsciiGridRowProps {
  rowData: RowData;
  colorMap: ColorMap;
}

const AsciiGridRow = memo(function AsciiGridRow({ rowData, colorMap }: AsciiGridRowProps) {
  const runs = coalesceRow(rowData.cells);

  return (
    <div style={{ height: '1lh', whiteSpace: 'pre', lineHeight: 1 }}>
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
    </div>
  );
}, (prev, next) => prev.rowData.version === next.rowData.version && prev.colorMap === next.colorMap);

// ─── Grid Container ──────────────────────────────────────────────────────────

export interface AsciiGridProps {
  snapshot: GridSnapshot;
  colorMap?: ColorMap;
}

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
      {snapshot.rows.map((rowData, r) => (
        <AsciiGridRow key={r} rowData={rowData} colorMap={colorMap} />
      ))}

      {/* Cursor overlay */}
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
