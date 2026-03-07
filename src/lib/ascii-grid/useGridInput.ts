import { useEffect, useCallback, useState, useRef, type RefObject } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InputMode = 'realtime' | 'line' | 'prompt' | 'disabled';

export interface GridKeyEvent {
  key: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  raw: string;
  code: string;
}

export interface UseGridInputOptions {
  mode: InputMode;
  onKey?: (event: GridKeyEvent) => void;
  onLine?: (text: string) => void;
  onPromptKey?: (key: string) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

// ─── Key normalization ───────────────────────────────────────────────────────

const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Escape: 'escape',
  Backspace: 'backspace',
  Tab: 'tab',
  ' ': 'space',
};

function normalizeKey(e: KeyboardEvent): GridKeyEvent {
  let key = KEY_MAP[e.key] ?? e.key;
  if (key.length === 1 && key >= 'A' && key <= 'Z' && !e.shiftKey) {
    key = key.toLowerCase();
  } else if (key.length === 1) {
    key = key.toLowerCase();
  }
  return {
    key,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    raw: e.key,
    code: e.code,
  };
}

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', ' ',
]);

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGridInput(options: UseGridInputOptions) {
  const { mode, onKey, onLine, onPromptKey, containerRef } = options;

  const [lineValue, setLineValue] = useState('');
  const [promptText, setPromptText] = useState('');
  const lineInputRef = useRef<HTMLInputElement | null>(null);

  // Focus management on mode change
  useEffect(() => {
    if (mode === 'line') {
      lineInputRef.current?.focus();
    } else if (mode === 'realtime' || mode === 'prompt') {
      containerRef.current?.focus();
    }
  }, [mode, containerRef]);

  // Realtime key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (mode === 'disabled') return;

    if (mode === 'realtime') {
      if (PREVENT_DEFAULT_KEYS.has(e.key)) {
        e.preventDefault();
      }
      onKey?.(normalizeKey(e));
    } else if (mode === 'prompt') {
      e.preventDefault();
      onPromptKey?.(normalizeKey(e).key);
    }
  }, [mode, onKey, onPromptKey]);

  // Attach keydown to the container div
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (mode !== 'realtime' && mode !== 'prompt') return;

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, mode, handleKeyDown]);

  // Line input submit handler
  const handleLineSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onLine?.(lineValue);
    setLineValue('');
  }, [lineValue, onLine]);

  const handleLineChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLineValue(e.target.value);
  }, []);

  // Props to spread on the container div for focus
  const containerProps = {
    tabIndex: 0,
    style: { outline: 'none' } as const,
  };

  // Props for the line input
  const lineInputProps = {
    ref: lineInputRef,
    value: lineValue,
    onChange: handleLineChange,
    onSubmit: handleLineSubmit,
  };

  return {
    lineValue,
    promptText,
    setPromptText,
    containerProps,
    lineInputProps,
    handleLineSubmit,
  };
}
