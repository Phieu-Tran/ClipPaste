import { useState, useCallback, useRef } from 'react';
import { ScratchpadItem } from '../../types';
import { cmd } from '../../commands';
import { ViewMode } from './scratchpadShared';

/** Drag & drop: dropping external text creates a note; dragging cards reorders them. */
export function useScratchpadDrag({
  scratchpads,
  setScratchpads,
  setPinned,
  mode,
  setMode,
  panelRef,
}: {
  scratchpads: ScratchpadItem[];
  setScratchpads: React.Dispatch<React.SetStateAction<ScratchpadItem[]>>;
  setPinned: (v: boolean) => void;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  panelRef: React.RefObject<HTMLDivElement>;
}) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragItemRef = useRef<string | null>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        try {
          const lines = text.split('\n');
          const title = lines[0].slice(0, 80);
          const content = lines.length > 1 ? lines.slice(1).join('\n') : '';
          const item = await cmd.createScratchpad(title, content);
          setScratchpads((prev) => [...prev, item]);
          setPinned(true);
        } catch {}
      }
    },
    [setPinned, setScratchpads]
  );
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
      if (mode === 'collapsed') setMode('list');
    },
    [mode, setMode]
  );
  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.relatedTarget as Node))
        setIsDragOver(false);
    },
    [panelRef]
  );
  const handleItemDragStart = useCallback((id: string) => {
    dragItemRef.current = id;
  }, []);
  const handleItemDragOver = useCallback((e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragItemRef.current) setDragOverIndex(i);
  }, []);
  const handleItemDrop = useCallback(
    async (index: number) => {
      const dragId = dragItemRef.current;
      if (!dragId) return;
      const ids = scratchpads.map((s) => s.id);
      const di = ids.indexOf(dragId);
      if (di === -1 || di === index) {
        dragItemRef.current = null;
        setDragOverIndex(null);
        return;
      }
      const r = [...ids];
      const [m] = r.splice(di, 1);
      r.splice(index, 0, m);
      const map = new Map(scratchpads.map((s) => [s.id, s]));
      setScratchpads(r.map((id) => map.get(id)!).filter(Boolean));
      await cmd.reorderScratchpads(r).catch(() => {});
      dragItemRef.current = null;
      setDragOverIndex(null);
    },
    [scratchpads, setScratchpads]
  );
  const handleItemDragEnd = useCallback(() => {
    dragItemRef.current = null;
    setDragOverIndex(null);
  }, []);

  return {
    isDragOver,
    dragOverIndex,
    dragItemRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleItemDragStart,
    handleItemDragOver,
    handleItemDrop,
    handleItemDragEnd,
  };
}
