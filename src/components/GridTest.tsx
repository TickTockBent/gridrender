import React, { useCallback, useEffect, useRef } from 'react';
import { useAsciiGrid } from '../lib/ascii-grid/useAsciiGrid';
import { useGridInput, type InputMode, type GridKeyEvent } from '../lib/ascii-grid/useGridInput';
import { AsciiGrid, wesOSColors, type ColorMap } from './AsciiGrid';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GridTestProps {
  onGameEnd: () => void;
  scrollToBottom: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GRID_WIDTH = 80;
const GRID_HEIGHT = 24;

const COLOR_TOKENS = ['white', 'green', 'cyan', 'magenta', 'yellow', 'red', 'muted'] as const;

const testColors: ColorMap = {
  ...wesOSColors,
};

const MODE_ORDER: InputMode[] = ['realtime', 'line', 'prompt'];

// ─── Component ───────────────────────────────────────────────────────────────

export function GridTest({ onGameEnd, scrollToBottom }: GridTestProps) {
  const { buffer, snapshot, flush } = useAsciiGrid(GRID_WIDTH, GRID_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);

  const modeRef = useRef<InputMode>('realtime');
  const playerRef = useRef({ row: 12, col: 40 });
  const lastPromptKeyRef = useRef<string>('');

  // We need a state-driven mode for the input hook
  const [mode, setMode] = React.useState<InputMode>('realtime');

  const drawScreen = useCallback(() => {
    const player = playerRef.current;

    // Status bar (row 0)
    buffer.fillRect(0, 0, 0, GRID_WIDTH - 1, ' ', { fg: 'cyan', bg: 'bg' });
    buffer.putString(0, 1, `GridTest | @:${player.row},${player.col} | Mode: ${modeRef.current} | Tab=cycle mode | /quit=exit`, { fg: 'cyan' });

    // Color palette (rows 2-3)
    buffer.putString(2, 1, 'Color palette:', { fg: 'white', bold: true });
    let col = 1;
    for (const token of COLOR_TOKENS) {
      const label = ` ${token} `;
      buffer.putString(3, col, label, { fg: token });
      col += label.length + 1;
    }

    // Box drawing test (rows 5-10)
    buffer.drawBox(5, 1, 10, 30, 'single', { fg: 'green' });
    buffer.putString(5, 3, ' Single Box ', { fg: 'green' });
    buffer.drawBox(5, 35, 10, 65, 'double', { fg: 'magenta' });
    buffer.putString(5, 37, ' Double Box ', { fg: 'magenta' });

    // Player character
    buffer.putChar(player.row, player.col, '@', { fg: 'yellow', bold: true });

    // Cursor tracks player
    buffer.moveCursor(player.row, player.col);

    // Mode-specific info at bottom
    if (modeRef.current === 'prompt') {
      buffer.putString(22, 1, 'PROMPT MODE: Press any key...', { fg: 'magenta' });
      if (lastPromptKeyRef.current) {
        buffer.putString(23, 1, `Last key: ${lastPromptKeyRef.current}`, { fg: 'muted' });
      }
    } else if (modeRef.current === 'line') {
      buffer.putString(22, 1, 'LINE MODE: Type a command below, press Enter', { fg: 'cyan' });
    } else {
      buffer.putString(22, 1, 'REALTIME MODE: Arrow keys to move @', { fg: 'green' });
    }

    flush();
  }, [buffer, flush]);

  // Initial draw
  useEffect(() => {
    buffer.clear();
    drawScreen();
    scrollToBottom();
  }, [buffer, drawScreen, scrollToBottom]);

  // Realtime key handler
  const handleKey = useCallback((event: GridKeyEvent) => {
    const player = playerRef.current;

    // Erase old player position
    buffer.putChar(player.row, player.col, '.', { fg: 'muted' });

    if (event.key === 'tab') {
      // Cycle input mode
      const idx = MODE_ORDER.indexOf(modeRef.current);
      const nextMode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
      modeRef.current = nextMode;
      setMode(nextMode);
    } else {
      // Movement
      switch (event.key) {
        case 'up':    player.row = Math.max(1, player.row - 1); break;
        case 'down':  player.row = Math.min(GRID_HEIGHT - 2, player.row + 1); break;
        case 'left':  player.col = Math.max(0, player.col - 1); break;
        case 'right': player.col = Math.min(GRID_WIDTH - 1, player.col + 1); break;
        // HJKL vim-style
        case 'h': player.col = Math.max(0, player.col - 1); break;
        case 'j': player.row = Math.min(GRID_HEIGHT - 2, player.row + 1); break;
        case 'k': player.row = Math.max(1, player.row - 1); break;
        case 'l': player.col = Math.min(GRID_WIDTH - 1, player.col + 1); break;
      }
    }

    drawScreen();
  }, [buffer, drawScreen]);

  // Line input handler
  const handleLine = useCallback((text: string) => {
    if (text === '/quit') {
      onGameEnd();
      return;
    }
    // Show the typed text on row 23
    buffer.fillRect(23, 0, 23, GRID_WIDTH - 1, ' ');
    buffer.putString(23, 1, `> ${text}`, { fg: 'white' });
    flush();
  }, [buffer, flush, onGameEnd]);

  // Prompt key handler
  const handlePromptKey = useCallback((key: string) => {
    lastPromptKeyRef.current = key;
    // After capturing, cycle back to realtime
    modeRef.current = 'realtime';
    setMode('realtime');
    drawScreen();
  }, [drawScreen]);

  const { containerProps, lineInputProps, handleLineSubmit } = useGridInput({
    mode,
    onKey: handleKey,
    onLine: handleLine,
    onPromptKey: handlePromptKey,
    containerRef,
  });

  return (
    <div>
      <div ref={containerRef} {...containerProps}>
        <AsciiGrid snapshot={snapshot} colorMap={testColors} />
      </div>

      {mode === 'line' && (
        <form onSubmit={handleLineSubmit} style={{ marginTop: '4px' }}>
          <input
            {...lineInputProps}
            type="text"
            autoComplete="off"
            placeholder="Type a command..."
            style={{
              fontFamily: 'monospace',
              fontSize: '14px',
              backgroundColor: '#0a0a0f',
              color: '#39ff14',
              border: '1px solid #39ff14',
              padding: '4px 8px',
              width: `${GRID_WIDTH}ch`,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </form>
      )}
    </div>
  );
}
