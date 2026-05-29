import { useCallback, useRef, useState } from 'react';
import { FolderItem } from '../types';
import { toast } from 'sonner';
import { cmd } from '../commands';
import { DEBOUNCE } from '../constants';

interface UseFolderActionsOpts {
  selectedFolder: string | null;
  setSelectedFolder: (v: string | null) => void;
  setClips: React.Dispatch<React.SetStateAction<import('../types').ClipboardItem[]>>;
}

export function useFolderActions(opts: UseFolderActionsOpts) {
  const { selectedFolder, setSelectedFolder, setClips } = opts;

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [totalClipCount, setTotalClipCount] = useState(0);

  const loadFolders = useCallback(async () => {
    try {
      const data = await cmd.getFolders();
      setFolders(data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

  const refreshTotalCount = useCallback(async () => {
    try {
      const count = await cmd.getClipboardHistorySize();
      setTotalClipCount(count);
    } catch (e) {
      console.error('Failed to get history size', e);
    }
  }, []);

  const handleCreateFolder = async (name: string, color: string | null, icon: string | null) => {
    try {
      await cmd.createFolder(name, icon, color);
      await loadFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!folderId) return;
    try {
      await cmd.deleteFolder(folderId);
      if (selectedFolder === folderId) {
        setSelectedFolder(null);
      }
      await loadFolders();
      refreshTotalCount();
      toast.success('Folder deleted');
    } catch (error) {
      console.error('Failed to delete folder:', error);
      toast.error('Failed to delete folder');
    }
  };

  const handleReorderFolders = async (folderIds: string[]) => {
    try {
      await cmd.reorderFolders(folderIds);
      await loadFolders();
    } catch (error) {
      console.error('Failed to reorder folders:', error);
    }
  };

  const handleMoveClip = async (clipId: string, folderId: string | null) => {
    try {
      await cmd.moveToFolder(clipId, folderId);

      if (selectedFolder) {
        if (folderId !== selectedFolder) {
          setClips((prev) => prev.filter((c) => c.id !== clipId));
        }
      } else {
        setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, folder_id: folderId } : c)));
      }
      loadFolders();
      refreshTotalCount();
    } catch (error) {
      console.error('Failed to move clip:', error);
    }
  };

  // Debounced folder/count refresh — avoids hammering DB on rapid copies
  const folderRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFolderRefresh = useCallback(() => {
    if (folderRefreshTimerRef.current) clearTimeout(folderRefreshTimerRef.current);
    folderRefreshTimerRef.current = setTimeout(() => {
      loadFolders();
      refreshTotalCount();
    }, DEBOUNCE.FOLDER_REFRESH);
  }, [loadFolders, refreshTotalCount]);

  return {
    folders,
    setFolders,
    totalClipCount,
    loadFolders,
    refreshTotalCount,
    handleCreateFolder,
    handleDeleteFolder,
    handleReorderFolders,
    handleMoveClip,
    debouncedFolderRefresh,
  };
}
