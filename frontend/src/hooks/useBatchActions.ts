import { useCallback } from 'react';
import { ClipboardItem as AppClipboardItem } from '../types';
import { toast } from 'sonner';
import { cmd } from '../commands';
import { TIMING } from '../constants';

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
            const count = await cmd.bulkDeleteClips(ids);
            setClips((prev) => prev.filter((c) => !selectedClipIds.has(c.id)));
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
      duration: TIMING.DELETE_TOAST,
    });
  }, [
    selectedClipIds,
    setClips,
    setSelectedClipIds,
    setSelectedClipId,
    loadFolders,
    refreshTotalCount,
  ]);

  const handleBulkMove = useCallback(
    async (folderId: string | null) => {
      if (selectedClipIds.size === 0) return;
      const ids = Array.from(selectedClipIds);
      try {
        await cmd.bulkMoveClips(ids, folderId);
        if (selectedFolder && folderId !== selectedFolder) {
          setClips((prev) => prev.filter((c) => !selectedClipIds.has(c.id)));
        } else {
          setClips((prev) =>
            prev.map((c) => (selectedClipIds.has(c.id) ? { ...c, folder_id: folderId } : c))
          );
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
    },
    [
      selectedClipIds,
      selectedFolder,
      setClips,
      setSelectedClipIds,
      setSelectedClipId,
      loadFolders,
      refreshTotalCount,
    ]
  );

  const handleBulkPaste = useCallback(async () => {
    if (selectedClipIds.size === 0) return;
    const displayedClips = isPreviewing ? filteredPreviewClips : filteredClips;
    const textsInOrder = displayedClips
      .filter((c) => selectedClipIds.has(c.id) && c.clip_type !== 'image')
      .map((c) => c.content);
    if (textsInOrder.length === 0) {
      toast.error('No text clips selected');
      return;
    }
    try {
      await cmd.pasteText(textsInOrder.join('\n'));
      setSelectedClipIds(new Set());
      setSelectedClipId(null);
    } catch (error) {
      console.error('Bulk paste failed:', error);
      toast.error('Failed to paste');
    }
  }, [
    selectedClipIds,
    isPreviewing,
    filteredPreviewClips,
    filteredClips,
    setSelectedClipIds,
    setSelectedClipId,
  ]);

  const handleBulkSetPin = useCallback(
    async (pinned: boolean) => {
      if (selectedClipIds.size === 0) return;
      const ids = Array.from(selectedClipIds);
      try {
        const count = await cmd.bulkSetPin(ids, pinned);
        setClips((prev) =>
          prev.map((clip) => (selectedClipIds.has(clip.id) ? { ...clip, is_pinned: pinned } : clip))
        );
        setSelectedClipIds(new Set());
        setSelectedClipId(null);
        toast.success(`${pinned ? 'Pinned' : 'Unpinned'} ${count} clips`);
      } catch (error) {
        console.error('Bulk pin failed:', error);
        toast.error(pinned ? 'Failed to pin clips' : 'Failed to unpin clips');
      }
    },
    [selectedClipIds, setClips, setSelectedClipIds, setSelectedClipId]
  );

  return {
    handleBulkDelete,
    handleBulkMove,
    handleBulkPaste,
    handleBulkSetPin,
  };
}
