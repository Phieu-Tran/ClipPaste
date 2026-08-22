import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    toast(t('batch.deleteConfirm', { count: ids.length }), {
      action: {
        label: t('common.delete'),
        onClick: async () => {
          try {
            const count = await cmd.bulkDeleteClips(ids);
            setClips((prev) => prev.filter((c) => !selectedClipIds.has(c.id)));
            setSelectedClipIds(new Set());
            setSelectedClipId(null);
            loadFolders();
            refreshTotalCount();
            toast.success(t('folders.deletedClips', { count }));
          } catch (error) {
            console.error('Bulk delete failed:', error);
            toast.error(t('batch.deleteFailed'));
          }
        },
      },
      cancel: { label: t('common.cancel'), onClick: () => {} },
      duration: TIMING.DELETE_TOAST,
    });
  }, [
    selectedClipIds,
    t,
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
        toast.success(t('folders.movedClips', { count: ids.length }));
      } catch (error) {
        console.error('Bulk move failed:', error);
        toast.error(t('batch.moveFailed'));
      }
    },
    [
      selectedClipIds,
      t,
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
    const selectedClipsInOrder = displayedClips.filter((c) => selectedClipIds.has(c.id));
    if (selectedClipsInOrder.length === 0) {
      return;
    }
    const hasImages = selectedClipsInOrder.some((c) => c.clip_type === 'image');
    const hasText = selectedClipsInOrder.some((c) => c.clip_type !== 'image');
    if (hasImages && hasText) {
      toast.error(t('batch.mixedTypes'));
      return;
    }

    try {
      await cmd.pasteClips(selectedClipsInOrder.map((c) => c.id));
      setSelectedClipIds(new Set());
      setSelectedClipId(null);
    } catch (error) {
      console.error('Bulk paste failed:', error);
      toast.error(error ? String(error) : t('batch.pasteFailed'));
    }
  }, [
    selectedClipIds,
    t,
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
        toast.success(t(pinned ? 'folders.pinnedClips' : 'folders.unpinnedClips', { count }));
      } catch (error) {
        console.error('Bulk pin failed:', error);
        toast.error(t(pinned ? 'batch.pinFailed' : 'batch.unpinFailed'));
      }
    },
    [selectedClipIds, t, setClips, setSelectedClipIds, setSelectedClipId]
  );

  return {
    handleBulkDelete,
    handleBulkMove,
    handleBulkPaste,
    handleBulkSetPin,
  };
}
