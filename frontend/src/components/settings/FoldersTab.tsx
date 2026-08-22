import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardItem, FolderItem } from '../../types';
import {
  ArrowRightLeft,
  Folder as FolderIcon,
  GitMerge,
  Inbox,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import { evictClipImageDataUrl } from '../../imageQueue';
import { FolderColorDot, FolderGlyph } from './FolderVisuals';
import { FolderSidebarItem } from './FolderSidebarItem';
import { FolderClipRow } from './FolderClipRow';
import { MoveClipPopover } from './MoveClipPopover';

interface FoldersTabProps {
  folders: FolderItem[];
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  editingFolderId: string | null;
  setEditingFolderId: (v: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  loadFolders: () => Promise<void>;
  requestConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    details?: string[];
    action: () => Promise<void>;
  }) => void;
}

export function FoldersTab({
  folders,
  newFolderName,
  setNewFolderName,
  editingFolderId,
  setEditingFolderId,
  renameValue,
  setRenameValue,
  loadFolders,
  requestConfirm,
}: FoldersTabProps) {
  const { t } = useTranslation();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [clipsByFolder, setClipsByFolder] = useState<Record<string, ClipboardItem[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [moveTargetClipId, setMoveTargetClipId] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState('');
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [editingFolderColor, setEditingFolderColor] = useState<string | null>(null);
  const [editingFolderIcon, setEditingFolderIcon] = useState<string | null>(null);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [folderTransferTargetId, setFolderTransferTargetId] = useState<string>('none');

  const customFolders = useMemo(() => folders.filter((f) => !f.is_system), [folders]);
  const totalFiledClips = useMemo(
    () => customFolders.reduce((sum, folder) => sum + folder.item_count, 0),
    [customFolders]
  );
  const filteredFolders = useMemo(() => {
    const query = folderSearch.trim().toLowerCase();
    if (!query) return customFolders;
    return customFolders.filter((folder) => folder.name.toLowerCase().includes(query));
  }, [customFolders, folderSearch]);
  const selectedFolder = useMemo(
    () => customFolders.find((folder) => folder.id === selectedFolderId) ?? null,
    [customFolders, selectedFolderId]
  );
  const folderTransferTargets = useMemo(
    () => customFolders.filter((folder) => folder.id !== selectedFolderId),
    [customFolders, selectedFolderId]
  );
  const selectedFolderClips = selectedFolderId ? clipsByFolder[selectedFolderId] : undefined;
  const isSelectedFolderLoading = selectedFolderId ? loadingId === selectedFolderId : false;
  const selectedClipCount = selectedClipIds.size;
  const searchActive = Boolean(folderSearch.trim());

  const loadClipsForFolder = useCallback(
    async (folderId: string) => {
      setLoadingId(folderId);
      try {
        const clips = await cmd.getClips({
          filterId: folderId,
          limit: 500,
          offset: 0,
          previewOnly: true,
        });
        setClipsByFolder((prev) => ({ ...prev, [folderId]: clips }));
      } catch (e) {
        toast.error(t('folders.loadClipsFailed', { error: String(e) }));
      } finally {
        setLoadingId((cur) => (cur === folderId ? null : cur));
      }
    },
    [t]
  );

  useEffect(() => {
    if (customFolders.length === 0) {
      setSelectedFolderId(null);
      return;
    }
    if (!selectedFolderId || !customFolders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(customFolders[0].id);
    }
  }, [customFolders, selectedFolderId]);

  useEffect(() => {
    if (selectedFolderId && !clipsByFolder[selectedFolderId]) {
      loadClipsForFolder(selectedFolderId);
    }
    setSelectedClipIds(new Set());
    setMoveTargetClipId(null);
    setFolderTransferTargetId('none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await cmd.createFolder(newFolderName.trim(), null, null);
      setNewFolderName('');
      await loadFolders();
      toast.success(t('folders.created'));
    } catch (e) {
      toast.error(t('folders.createFailed', { error: String(e) }));
    }
  };

  const handleDeleteFolder = async (id: string) => {
    const folder = customFolders.find((item) => item.id === id);
    requestConfirm({
      title: t('dialogs.deleteFolderTitle'),
      message: t('dialogs.deleteFolderMessage', {
        name: folder?.name ?? t('folders.thisFolder'),
      }),
      confirmText: t('common.delete'),
      variant: 'danger',
      details:
        folder && folder.item_count > 0
          ? [t('folders.clipsWillLeave', { count: folder.item_count.toLocaleString() })]
          : undefined,
      action: async () => {
        try {
          await cmd.deleteFolder(id);
          if (selectedFolderId === id) setSelectedFolderId(null);
          setClipsByFolder((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          await loadFolders();
          toast.success(t('folders.deleted'));
        } catch (e) {
          toast.error(t('folders.deleteFailed', { error: String(e) }));
        }
      },
    });
  };

  const handleReorderFolders = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId || searchActive) return;
    const ids = customFolders.map((folder) => folder.id);
    const fromIndex = ids.indexOf(sourceId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...ids];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    try {
      await cmd.reorderFolders(reordered);
      await loadFolders();
      toast.success(t('folders.reordered'));
    } catch (e) {
      toast.error(t('folders.reorderFailed', { error: String(e) }));
    } finally {
      setDragFolderId(null);
      setDropFolderId(null);
    }
  };

  const handleMoveEntireFolder = async () => {
    if (!selectedFolder || folderTransferTargetId === 'none') return;
    const target = customFolders.find((folder) => folder.id === folderTransferTargetId);
    if (!target) return;

    try {
      const moved = await cmd.moveFolderClips(selectedFolder.id, target.id);
      setClipsByFolder((prev) => {
        const next = { ...prev };
        delete next[selectedFolder.id];
        delete next[target.id];
        return next;
      });
      await loadFolders();
      await loadClipsForFolder(selectedFolder.id);
      toast.success(t('folders.movedTo', { count: moved.toLocaleString(), name: target.name }));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const handleMergeFolder = async () => {
    if (!selectedFolder || folderTransferTargetId === 'none') return;
    const target = customFolders.find((folder) => folder.id === folderTransferTargetId);
    if (!target) return;

    requestConfirm({
      title: t('folders.mergeTitle'),
      message: t('folders.mergeMessage', { source: selectedFolder.name, target: target.name }),
      confirmText: t('folders.merge'),
      variant: 'warning',
      details: [
        t('folders.clipsWillMove', { count: selectedFolder.item_count.toLocaleString() }),
        t('folders.mergeRemovesSource'),
      ],
      action: async () => {
        try {
          const moved = await cmd.mergeFolder(selectedFolder.id, target.id);
          setSelectedFolderId(target.id);
          setFolderTransferTargetId('none');
          setClipsByFolder((prev) => {
            const next = { ...prev };
            delete next[selectedFolder.id];
            delete next[target.id];
            return next;
          });
          await loadFolders();
          await loadClipsForFolder(target.id);
          toast.success(t('folders.merged', { count: moved.toLocaleString(), name: target.name }));
        } catch (e) {
          toast.error(t('folders.actionFailed', { error: String(e) }));
        }
      },
    });
  };

  const startRenameFolder = (folder: FolderItem) => {
    setEditingFolderId(folder.id);
    setRenameValue(folder.name);
    setEditingFolderColor(folder.color ?? null);
    setEditingFolderIcon(folder.icon ?? null);
  };

  const cancelRenameFolder = () => {
    setEditingFolderId(null);
    setRenameValue('');
    setEditingFolderColor(null);
    setEditingFolderIcon(null);
  };

  const saveRenameFolder = async () => {
    if (!editingFolderId || !renameValue.trim()) return;
    try {
      await cmd.renameFolder(
        editingFolderId,
        renameValue.trim(),
        editingFolderColor,
        editingFolderIcon
      );
      cancelRenameFolder();
      await loadFolders();
      toast.success(t('folders.updated'));
    } catch (e) {
      toast.error(t('folders.updateFailed', { error: String(e) }));
    }
  };

  const refreshSelectedFolder = async () => {
    await loadFolders();
    if (selectedFolderId) await loadClipsForFolder(selectedFolderId);
  };

  const handleMoveClip = async (
    clipUuid: string,
    fromFolderId: string,
    toFolderId: string | null
  ) => {
    try {
      await cmd.moveToFolder(clipUuid, toFolderId);
      setMoveTargetClipId(null);
      await loadFolders();
      await loadClipsForFolder(fromFolderId);
      if (toFolderId && clipsByFolder[toFolderId]) {
        await loadClipsForFolder(toFolderId);
      }
      toast.success(t(toFolderId ? 'folders.clipMoved' : 'folders.clipMovedToAll'));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const handleBulkMove = async (toFolderId: string | null) => {
    if (!selectedFolderId || selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      await cmd.bulkMoveClips(ids, toFolderId);
      setMoveTargetClipId(null);
      setSelectedClipIds(new Set());
      await loadFolders();
      await loadClipsForFolder(selectedFolderId);
      if (toFolderId && clipsByFolder[toFolderId]) {
        await loadClipsForFolder(toFolderId);
      }
      toast.success(t('folders.movedClips', { count: ids.length }));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const handleDeleteClip = async (clipUuid: string, folderId: string) => {
    try {
      await cmd.deleteClip(clipUuid);
      evictClipImageDataUrl(clipUuid);
      setSelectedClipIds((prev) => {
        const next = new Set(prev);
        next.delete(clipUuid);
        return next;
      });
      await loadFolders();
      await loadClipsForFolder(folderId);
      toast.success(t('folders.clipDeleted'));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      const count = await cmd.bulkDeleteClips(ids);
      ids.forEach(evictClipImageDataUrl);
      setSelectedClipIds(new Set());
      await refreshSelectedFolder();
      toast.success(t('folders.deletedClips', { count }));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const handleBulkSetPin = async (pinned: boolean) => {
    if (!selectedFolderId || selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      const count = await cmd.bulkSetPin(ids, pinned);
      setSelectedClipIds(new Set());
      await loadClipsForFolder(selectedFolderId);
      toast.success(t(pinned ? 'folders.pinnedClips' : 'folders.unpinnedClips', { count }));
    } catch (e) {
      toast.error(t('folders.actionFailed', { error: String(e) }));
    }
  };

  const toggleClipSelection = (clipId: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!selectedFolderClips || selectedFolderClips.length === 0) return;
    setSelectedClipIds((prev) =>
      prev.size === selectedFolderClips.length
        ? new Set()
        : new Set(selectedFolderClips.map((clip) => clip.id))
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{t('folders.manageTitle')}</h3>
        {customFolders.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('folders.summary', {
              folders: customFolders.length,
              clips: totalFiledClips.toLocaleString(),
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t('folders.newFolderPlaceholder')}
            className="field min-w-0 flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim()}
            className="btn btn-secondary px-3"
          >
            <Plus size={16} className="mr-1" />
            {t('folders.add')}
          </button>
        </div>
        <button
          onClick={refreshSelectedFolder}
          className="btn btn-secondary px-3"
          title={t('folders.refresh')}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('folders.statFolders')}
          </div>
          <div className="text-lg font-semibold tabular-nums">{customFolders.length}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('folders.statFiled')}
          </div>
          <div className="text-lg font-semibold tabular-nums">{totalFiledClips}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('folders.statSelected')}
          </div>
          <div className="text-lg font-semibold tabular-nums">{selectedClipCount}</div>
        </div>
      </div>

      <div className="grid min-h-[460px] grid-cols-[250px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-background/40">
        <aside className="flex min-h-0 flex-col border-r border-border bg-card/70">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
              <Search size={15} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                placeholder={t('folders.filterPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {folderSearch && (
                <button
                  onClick={() => setFolderSearch('')}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {customFolders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                No custom folders created.
              </p>
            ) : filteredFolders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                No folders match "{folderSearch.trim()}".
              </p>
            ) : (
              <div className="space-y-1">
                {filteredFolders.map((folder) => (
                  <FolderSidebarItem
                    key={folder.id}
                    folder={folder}
                    isSelected={selectedFolderId === folder.id}
                    isEditing={editingFolderId === folder.id}
                    isDragSource={dragFolderId === folder.id}
                    isDropTarget={dropFolderId === folder.id}
                    searchActive={searchActive}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    editingColor={editingFolderColor}
                    setEditingColor={setEditingFolderColor}
                    editingIcon={editingFolderIcon}
                    setEditingIcon={setEditingFolderIcon}
                    onSelect={() => setSelectedFolderId(folder.id)}
                    onSaveRename={saveRenameFolder}
                    onCancelRename={cancelRenameFolder}
                    onDragStart={(event) => {
                      if (editingFolderId === folder.id || searchActive) {
                        event.preventDefault();
                        return;
                      }
                      setDragFolderId(folder.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      if (!dragFolderId || dragFolderId === folder.id || searchActive) {
                        return;
                      }
                      event.preventDefault();
                      setDropFolderId(folder.id);
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDragLeave={() => {
                      if (dropFolderId === folder.id) setDropFolderId(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragFolderId) handleReorderFolders(dragFolderId, folder.id);
                    }}
                    onDragEnd={() => {
                      setDragFolderId(null);
                      setDropFolderId(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card/50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {selectedFolder ? (
                  <>
                    <FolderGlyph folder={selectedFolder} />
                    <FolderColorDot color={selectedFolder.color} />
                  </>
                ) : (
                  <FolderIcon size={16} className="shrink-0 text-blue-400" />
                )}
                <h4 className="truncate text-sm font-semibold">
                  {selectedFolder ? selectedFolder.name : t('folders.noFolderSelected')}
                </h4>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {selectedFolder
                  ? t('folders.clipsInFolder', {
                      count: selectedFolder.item_count.toLocaleString(),
                    })
                  : t('folders.selectFolderHint')}
              </div>
            </div>

            {selectedFolder && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => startRenameFolder(selectedFolder)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('folders.renameFolder')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDeleteFolder(selectedFolder.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t('dialogs.deleteFolderTitle')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {selectedFolder && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/30 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <ArrowRightLeft size={13} />
                <span className="truncate">{t('folders.transfer')}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select
                  value={folderTransferTargetId}
                  onChange={(event) => setFolderTransferTargetId(event.target.value)}
                  disabled={folderTransferTargets.length === 0}
                  className="field field-sm h-7 min-w-[160px]"
                >
                  <option value="none">{t('folders.targetFolder')}</option>
                  {folderTransferTargets.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleMoveEntireFolder}
                  disabled={folderTransferTargetId === 'none'}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <ArrowRightLeft size={12} />
                  {t('folders.moveAll')}
                </button>
                <button
                  onClick={handleMergeFolder}
                  disabled={folderTransferTargetId === 'none'}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <GitMerge size={12} />
                  {t('folders.merge')}
                </button>
              </div>
            </div>
          )}

          {selectedFolder && (
            <div
              className={`flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 transition-colors ${
                selectedClipCount > 0 ? 'bg-primary/5' : ''
              }`}
            >
              <button
                onClick={toggleSelectAll}
                disabled={!selectedFolderClips || selectedFolderClips.length === 0}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {selectedFolderClips && selectedClipIds.size === selectedFolderClips.length
                  ? t('folders.clearSelection')
                  : t('folders.selectAll')}
              </button>

              {selectedClipCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-xs font-medium text-primary">
                    {t('batchBar.selected', { count: selectedClipCount })}
                  </span>
                  <button
                    onClick={() => handleBulkSetPin(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pin size={12} />
                    {t('common.pin')}
                  </button>
                  <button
                    onClick={() => handleBulkSetPin(false)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <PinOff size={12} />
                    {t('common.unpin')}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() =>
                        setMoveTargetClipId(moveTargetClipId === '__bulk__' ? null : '__bulk__')
                      }
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {t('common.move')}
                    </button>
                    {moveTargetClipId === '__bulk__' && (
                      <MoveClipPopover
                        folders={customFolders}
                        excludeFolderId={selectedFolder.id}
                        onSelect={handleBulkMove}
                        onClose={() => setMoveTargetClipId(null)}
                      />
                    )}
                  </div>
                  <button
                    onClick={handleBulkDelete}
                    className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{t('folders.selectForBulk')}</span>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedFolder ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <FolderIcon size={24} className="opacity-50" />
                <span>{t('folders.noFolderSelected')}</span>
              </div>
            ) : isSelectedFolderLoading && !selectedFolderClips ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                {t('clipList.loading')}
              </div>
            ) : !selectedFolderClips || selectedFolderClips.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Inbox size={20} className="opacity-50" />
                <span>{t('folders.noClipsInFolder')}</span>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {selectedFolderClips.map((clip) => (
                  <FolderClipRow
                    key={clip.id}
                    clip={clip}
                    isChecked={selectedClipIds.has(clip.id)}
                    onToggleSelect={() => toggleClipSelection(clip.id)}
                    onToggleMove={() =>
                      setMoveTargetClipId(moveTargetClipId === clip.id ? null : clip.id)
                    }
                    onDelete={() => handleDeleteClip(clip.id, selectedFolder.id)}
                    movePopover={
                      moveTargetClipId === clip.id ? (
                        <MoveClipPopover
                          folders={customFolders}
                          excludeFolderId={selectedFolder.id}
                          onSelect={(toFolderId) =>
                            handleMoveClip(clip.id, selectedFolder.id, toFolderId)
                          }
                          onClose={() => setMoveTargetClipId(null)}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
