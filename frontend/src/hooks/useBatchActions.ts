import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ClipboardItem as AppClipboardItem } from '../types';
import { toast } from 'sonner';

interface UseBatchActionsOpts {
  selectedClipIds: Set<string>;
  setSelectedClipIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedClipId: (v: string | null) => void;
  setClips: React.Dispatch<React.SetStateAction<AppClipboardItem[]>>;
  selectedFolder: string | null;
  loadFolders: () => Promise<void>;
  refreshTotalCount: () => Promise<void>;
  isPreviewing: boolean;
  filteredPreviewClips: AppClipboardItem[];
  filteredClips: AppClipboardItem[];
}

export function useBatchActions(opts: UseBatchActionsOpts) {
  const {
    selectedClipIds,
    setSelectedClipIds,
    setSelectedClipId,
    setClips,
    selectedFolder,
    loadFolders,
    refreshTotalCount,
    isPreviewing,
    filteredPreviewClips,
    filteredClips,
  } = opts;

  const handleBulkDelete = useCallback(async () => {
    if (selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    toast(`Delete ${ids.length} clips?`, {
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            const count = await invoke<number>('bulk_delete_clips', { ids });
            setClips(prev => prev.filter(c => !selectedClipIds.has(c.id)));
            setSelectedClipIds(new Set());
            setSelectedClipId(null);
            loadFolders();
            refreshTotalCount();
            toast.success(`Deleted ${count} clips`);
          } catch (error) {
            console.error('Bulk delete failed:', error);
            toast.error('Failed to delete clips');
          }
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
      duration: 4000,
    });
  }, [selectedClipIds, setClips, setSelectedClipIds, setSelectedClipId, loadFolders, refreshTotalCount]);

  const handleBulkMove = useCallback(async (folderId: string | null) => {
    if (selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      await invoke('bulk_move_clips', { ids, folderId });
      if (selectedFolder && folderId !== selectedFolder) {
        setClips(prev => prev.filter(c => !selectedClipIds.has(c.id)));
      } else {
        setClips(prev => prev.map(c => selectedClipIds.has(c.id) ? { ...c, folder_id: folderId } : c));
      }
      setSelectedClipIds(new Set());
      setSelectedClipId(null);
      loadFolders();
      refreshTotalCount();
      toast.success(`Moved ${ids.length} clips`);
    } catch (error) {
      console.error('Bulk move failed:', error);
      toast.error('Failed to move clips');
    }
  }, [selectedClipIds, selectedFolder, setClips, setSelectedClipIds, setSelectedClipId, loadFolders, refreshTotalCount]);

  const handleBulkPaste = useCallback(async () => {
    if (selectedClipIds.size === 0) return;
    const displayedClips = isPreviewing ? filteredPreviewClips : filteredClips;
    const textsInOrder = displayedClips
      .filter(c => selectedClipIds.has(c.id) && c.clip_type !== 'image')
      .map(c => c.content);
    if (textsInOrder.length === 0) {
      toast.error('No text clips selected');
      return;
    }
    const combined = textsInOrder.join('\n');
    try {
      await invoke('paste_text', { content: combined });
      setSelectedClipIds(new Set());
      setSelectedClipId(null);
    } catch (error) {
      console.error('Bulk paste failed:', error);
      toast.error('Failed to paste');
    }
  }, [selectedClipIds, isPreviewing, filteredPreviewClips, filteredClips, setSelectedClipIds, setSelectedClipId]);

  return {
    handleBulkDelete,
    handleBulkMove,
    handleBulkPaste,
  };
}
