import { useCallback, useRef } from 'react';
import { ClipboardItem as AppClipboardItem } from '../types';
import { PAGE_SIZE, MAX_CLIPS_IN_STATE, TIMING } from '../constants';
import { cacheIcons, stripIcons } from '../iconCache';
import { evictClipImageDataUrl } from '../imageQueue';
import { toast } from 'sonner';
import { cmd } from '../commands';

interface UseClipActionsOpts {
  clips: AppClipboardItem[];
  setClips: React.Dispatch<React.SetStateAction<AppClipboardItem[]>>;
  setIsLoading: (v: boolean) => void;
  setHasMore: (v: boolean) => void;
  setSelectedClipId: (v: string | null) => void;
  setEditingClip: (v: AppClipboardItem | null) => void;
  setNoteModalClipId: (v: string | null) => void;
  setNoteModalInitial: (v: string) => void;
  loadFolders: () => Promise<void>;
  refreshTotalCount: () => Promise<void>;
  refreshCurrentFolder: () => void;
}

export function useClipActions(opts: UseClipActionsOpts) {
  const {
    clips,
    setClips,
    setIsLoading,
    setHasMore,
    setSelectedClipId,
    setEditingClip,
    setNoteModalClipId,
    setNoteModalInitial,
    loadFolders,
    refreshTotalCount,
    refreshCurrentFolder,
  } = opts;

  const isDeletingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  // Monotonic counter to discard stale responses from older queries
  const loadGenRef = useRef(0);
  const loadClips = useCallback(
    async (
      folderId: string | null,
      append: boolean = false,
      searchOverride: string = '',
      typeFilter: string | null = null
    ) => {
      if (append && isLoadingRef.current) return;

      const thisGen = ++loadGenRef.current;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const currentOffset = append ? clipsRef.current.length : 0;

        let data: AppClipboardItem[];

        const canUseBackendTypeFilter =
          !!typeFilter && folderId !== '__frequent__' && folderId !== '__smart__';

        if (searchOverride.trim()) {
          data = await cmd.searchClips({
            query: searchOverride,
            filterId: folderId,
            typeFilter,
            limit: PAGE_SIZE,
            offset: currentOffset,
          });
        } else if (canUseBackendTypeFilter) {
          data = await cmd.getClipsByTypeFilter({
            typeFilter,
            folderId,
            limit: PAGE_SIZE,
            offset: currentOffset,
          });
        } else {
          data = await cmd.getClips({
            filterId: folderId,
            limit: PAGE_SIZE,
            offset: currentOffset,
            previewOnly: false,
          });
        }

        // Discard if a newer query has been fired since
        if (loadGenRef.current !== thisGen) return;

        cacheIcons(data);
        const stripped = stripIcons(data);

        if (append) {
          setClips((prev) => {
            const combined = [...prev, ...stripped];
            return combined.length > MAX_CLIPS_IN_STATE
              ? combined.slice(0, MAX_CLIPS_IN_STATE)
              : combined;
          });
        } else {
          setClips(stripped);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (error) {
        console.error('Failed to load clips:', error);
      } finally {
        if (loadGenRef.current === thisGen) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [setClips, setIsLoading, setHasMore]
  );

  const doDelete = async (clipId: string) => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    try {
      await cmd.deleteClip(clipId);
      evictClipImageDataUrl(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setSelectedClipId(null);
      loadFolders();
      refreshTotalCount();
      toast.success('Clip deleted');
    } catch (error) {
      console.error('Failed to delete clip:', error);
      toast.error('Failed to delete clip');
    } finally {
      isDeletingRef.current = false;
    }
  };

  const handleDelete = async (clipId: string | null) => {
    if (!clipId) return;
    toast('Delete this clip?', {
      action: {
        label: 'Delete',
        onClick: () => doDelete(clipId),
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {},
      },
      duration: TIMING.DELETE_TOAST,
    });
  };

  const handlePaste = async (clipId: string) => {
    try {
      // Backend handles both text and image clipboard writes + auto-paste
      await cmd.pasteClip(clipId);
    } catch (error) {
      console.error('Failed to paste clip:', error);
      toast.error('Failed to paste clip');
    }
  };

  const handleCopy = async (clipId: string) => {
    try {
      // Backend handles both text and image clipboard writes
      await cmd.copyClip(clipId);
      toast.success('Copied to clipboard');
      return true;
    } catch (error) {
      console.error('Failed to copy clip:', error);
      toast.error('Failed to copy');
      return false;
    }
  };

  const handleTogglePin = async (clipId: string) => {
    try {
      const isPinned = await cmd.togglePin(clipId);
      setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, is_pinned: isPinned } : c)));
      toast.success(isPinned ? 'Pinned' : 'Unpinned');
      // Reload to re-sort pinned items to top
      refreshCurrentFolder();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      toast.error('Failed to pin clip');
    }
  };

  const handleEditBeforePaste = useCallback(
    (clipId: string) => {
      const clip = clipsRef.current.find((c) => c.id === clipId);
      if (clip && clip.clip_type !== 'image') {
        setEditingClip(clip);
      }
    },
    [setEditingClip]
  );

  const handlePasteEdited = useCallback(
    async (editedText: string) => {
      setEditingClip(null);
      try {
        await cmd.pasteText(editedText);
      } catch (error) {
        console.error('Failed to paste edited text:', error);
        toast.error('Failed to paste');
      }
    },
    [setEditingClip]
  );

  const handlePastePlainText = useCallback(async (clipId: string) => {
    const clip = clipsRef.current.find((c) => c.id === clipId);
    if (!clip || clip.clip_type === 'image') return;
    try {
      await cmd.pasteText(clip.content);
    } catch (error) {
      console.error('Failed to paste as plain text:', error);
      toast.error('Failed to paste');
    }
  }, []);

  const handleEditNote = useCallback(
    (clipId: string) => {
      const clip = clipsRef.current.find((c) => c.id === clipId);
      setNoteModalClipId(clipId);
      setNoteModalInitial(clip?.note || '');
    },
    [setNoteModalClipId, setNoteModalInitial]
  );

  const handleSaveNote = useCallback(
    async (clipId: string, note: string | null) => {
      setNoteModalClipId(null);
      try {
        await cmd.updateNote(clipId, note);
        setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, note } : c)));
        toast.success(note ? 'Note saved' : 'Note removed');
      } catch (error) {
        console.error('Failed to update note:', error);
        toast.error('Failed to save note');
      }
    },
    [setClips, setNoteModalClipId]
  );

  const handleSetSensitive = useCallback(
    async (clipId: string, sensitive: boolean) => {
      try {
        const nextValue = await cmd.setClipSensitive(clipId, sensitive);
        setClips((prev) =>
          prev.map((clip) => (clip.id === clipId ? { ...clip, is_sensitive: nextValue } : clip))
        );
        toast.success(nextValue ? 'Marked sensitive' : 'Marked not sensitive');
      } catch (error) {
        console.error('Failed to update sensitive flag:', error);
        toast.error('Failed to update sensitive flag');
      }
    },
    [setClips]
  );

  return {
    loadClips,
    loadGenRef,
    handleDelete,
    handlePaste,
    handleCopy,
    handleTogglePin,
    handleEditBeforePaste,
    handlePasteEdited,
    handlePastePlainText,
    handleEditNote,
    handleSaveNote,
    handleSetSensitive,
  };
}
