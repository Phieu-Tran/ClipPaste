import { useCallback, useState } from 'react';
import { ClipboardItem as AppClipboardItem } from '../types';

interface UseMultiSelectOptions {
  displayedClips: AppClipboardItem[];
}

export function useMultiSelect(opts: UseMultiSelectOptions) {
  const { displayedClips } = opts;

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());

  const handleSelectClip = useCallback((clipId: string, e?: React.MouseEvent) => {
    if (e?.shiftKey && selectedClipId) {
      // Range select: from last selected to clicked
      const startIdx = displayedClips.findIndex(c => c.id === selectedClipId);
      const endIdx = displayedClips.findIndex(c => c.id === clipId);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = displayedClips.slice(from, to + 1).map(c => c.id);
        setSelectedClipIds(prev => {
          const next = new Set(prev);
          if (selectedClipId && !next.has(selectedClipId)) {
            next.add(selectedClipId);
          }
          rangeIds.forEach(id => next.add(id));
          return next;
        });
      }
    } else if (e?.ctrlKey || e?.metaKey) {
      // Toggle select — also include the currently selected clip if not yet in set
      setSelectedClipIds(prev => {
        const next = new Set(prev);
        if (selectedClipId && !next.has(selectedClipId)) {
          next.add(selectedClipId);
        }
        if (next.has(clipId)) {
          next.delete(clipId);
        } else {
          next.add(clipId);
        }
        return next;
      });
    } else {
      // Single select — clear multi-select
      setSelectedClipIds(new Set());
    }
    setSelectedClipId(clipId);
  }, [selectedClipId, displayedClips]);

  const isMultiSelect = selectedClipIds.size > 1;

  return {
    selectedClipId,
    selectedClipIds,
    isMultiSelect,
    setSelectedClipId,
    setSelectedClipIds,
    handleSelectClip,
  };
}
