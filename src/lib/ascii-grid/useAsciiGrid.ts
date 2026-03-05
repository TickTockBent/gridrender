import { useRef, useState, useCallback } from 'react';
import { AsciiGridBuffer, GridSnapshot } from './AsciiGridBuffer';

export function useAsciiGrid(width: number, height: number) {
  const bufferRef = useRef<AsciiGridBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = new AsciiGridBuffer(width, height);
  }
  const buffer = bufferRef.current;

  const [snapshot, setSnapshot] = useState<GridSnapshot>(() => buffer.snapshot());

  const flush = useCallback(() => {
    setSnapshot(buffer.snapshot());
  }, [buffer]);

  return { buffer, snapshot, flush };
}
