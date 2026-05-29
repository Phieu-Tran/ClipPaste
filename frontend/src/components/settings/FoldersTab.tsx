import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardItem, FolderItem } from '../../types';
import {
  ArrowRightLeft,
  Check,
  Code,
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface FoldersTabProps {
  folders: FolderItem[];
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  editingFolderId: string | null;
  setEditingFolderId: (v: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  loadFolders: () => Promise<void>;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`;
  return `${Math.floor(diff / 2592000)}mo`;
}

function ClipTypeIcon({ type, className }: { type: string; className?: string }) {
  const props = { size: 14, className: className ?? 'text-muted-foreground shrink-0' };
  switch (type) {
    case 'image':
      return <ImageIcon {...props} />;
    case 'url':
      return <Link2 {...props} />;
    case 'html':
      return <Code {...props} />;
    case 'rtf':
      return <Type {...props} />;
    case 'file':
      return <FileIcon {...props} />;
    default:
      return <FileText {...props} />;
  }
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
}: FoldersTabProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [clipsByFolder, setClipsByFolder] = useState<Record<string, ClipboardItem[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [moveTargetClipId, setMoveTargetClipId] = useState<string | null>(null);
  const [moveSearch, setMoveSearch] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const movePopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moveTargetClipId) return;
    const onDown = (e: MouseEvent) => {
      if (movePopoverRef.current && !movePopoverRef.current.contains(e.target as Node)) {
        setMoveTargetClipId(null);
        setMoveSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moveTargetClipId]);

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
  const selectedFolderClips = selectedFolderId ? clipsByFolder[selectedFolderId] : undefined;
  const isSelectedFolderLoading = selectedFolderId ? loadingId === selectedFolderId : false;
  const selectedClipCount = selectedClipIds.size;

  const loadClipsForFolder = useCallback(async (folderId: string) => {
    setLoadingId(folderId);
    try {
      const clips = await invoke<ClipboardItem[]>('get_clips', {
        filterId: folderId,
        limit: 500,
        offset: 0,
        previewOnly: true,
      });
      setClipsByFolder((prev) => ({ ...prev, [folderId]: clips }));
    } catch (e) {
      toast.error(`Failed to load clips: ${e}`);
    } finally {
      setLoadingId((cur) => (cur === folderId ? null : cur));
    }
  }, []);

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
    setMoveSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await invoke('create_folder', { name: newFolderName.trim(), icon: null, color: null });
      setNewFolderName('');
      await loadFolders();
      toast.success('Folder created');
    } catch (e) {
      toast.error(`Failed to create folder: ${e}`);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await invoke('delete_folder', { id });
      if (selectedFolderId === id) setSelectedFolderId(null);
      setClipsByFolder((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadFolders();
      toast.success('Folder deleted');
    } catch (e) {
      toast.error(`Failed to delete folder: ${e}`);
    }
  };

  const startRenameFolder = (folder: FolderItem) => {
    setEditingFolderId(folder.id);
    setRenameValue(folder.name);
  };

  const saveRenameFolder = async () => {
    if (!editingFolderId || !renameValue.trim()) return;
    try {
      await invoke('rename_folder', { id: editingFolderId, name: renameValue.trim() });
      setEditingFolderId(null);
      setRenameValue('');
      await loadFolders();
      toast.success('Folder renamed');
    } catch (e) {
      toast.error(`Failed to rename folder: ${e}`);
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
      await invoke('move_to_folder', { clipId: clipUuid, folderId: toFolderId });
      setMoveTargetClipId(null);
      setMoveSearch('');
      await loadFolders();
      await loadClipsForFolder(fromFolderId);
      if (toFolderId && clipsByFolder[toFolderId]) {
        await loadClipsForFolder(toFolderId);
      }
      toast.success(toFolderId ? 'Clip moved' : 'Clip moved to All');
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleBulkMove = async (toFolderId: string | null) => {
    if (!selectedFolderId || selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      await invoke('bulk_move_clips', { ids, folderId: toFolderId });
      setMoveTargetClipId(null);
      setMoveSearch('');
      setSelectedClipIds(new Set());
      await loadFolders();
      await loadClipsForFolder(selectedFolderId);
      if (toFolderId && clipsByFolder[toFolderId]) {
        await loadClipsForFolder(toFolderId);
      }
      toast.success(`Moved ${ids.length} clip${ids.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleDeleteClip = async (clipUuid: string, folderId: string) => {
    try {
      await invoke('delete_clip', { id: clipUuid });
      setSelectedClipIds((prev) => {
        const next = new Set(prev);
        next.delete(clipUuid);
        return next;
      });
      await loadFolders();
      await loadClipsForFolder(folderId);
      toast.success('Clip deleted');
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedClipIds.size === 0) return;
    const ids = Array.from(selectedClipIds);
    try {
      const count = await invoke<number>('bulk_delete_clips', { ids });
      setSelectedClipIds(new Set());
      await refreshSelectedFolder();
      toast.success(`Deleted ${count} clip${count === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(`Failed: ${e}`);
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

  const renderMovePopover = (fromFolderId: string, clipId?: string) => {
    const lowerSearch = moveSearch.toLowerCase();
    const matchingFolders = customFolders
      .filter((folder) => folder.id !== fromFolderId)
      .filter((folder) => folder.name.toLowerCase().includes(lowerSearch));
    const isBulk = !clipId;

    return (
      <div
        ref={movePopoverRef}
        className="absolute right-0 top-8 z-30 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search size={12} className="text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={moveSearch}
            onChange={(e) => setMoveSearch(e.target.value)}
            placeholder="Search folders..."
            className="min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {'all'.includes(lowerSearch) && (
            <button
              onClick={() =>
                isBulk ? handleBulkMove(null) : handleMoveClip(clipId, fromFolderId, null)
              }
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
            >
              <Inbox size={13} className="text-muted-foreground" />
              <span>Move to All</span>
            </button>
          )}
          {matchingFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() =>
                isBulk ? handleBulkMove(folder.id) : handleMoveClip(clipId, fromFolderId, folder.id)
              }
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
            >
              <FolderIcon size={13} className="text-blue-400" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {folder.item_count}
              </span>
            </button>
          ))}
          {matchingFolders.length === 0 && !'all'.includes(lowerSearch) && (
            <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              No matching folder
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Manage Folders</h3>
        {customFolders.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {customFolders.length} folder{customFolders.length === 1 ? '' : 's'} ·{' '}
            {totalFiledClips.toLocaleString()} clips
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim()}
            className="btn btn-secondary px-3"
          >
            <Plus size={16} className="mr-1" />
            Add
          </button>
        </div>
        <button
          onClick={refreshSelectedFolder}
          className="btn btn-secondary px-3"
          title="Refresh folders"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Folders</div>
          <div className="text-lg font-semibold tabular-nums">{customFolders.length}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Filed</div>
          <div className="text-lg font-semibold tabular-nums">{totalFiledClips}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Selected</div>
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
                placeholder="Filter folders"
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
                {filteredFolders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  const isEditing = editingFolderId === folder.id;

                  return (
                    <div
                      key={folder.id}
                      className={`rounded-md border transition-colors ${
                        isSelected ? 'border-primary/40 bg-primary/10' : 'border-transparent'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 p-2">
                          <FolderIcon size={15} className="shrink-0 text-blue-400" />
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRenameFolder();
                              if (e.key === 'Escape') setEditingFolderId(null);
                            }}
                          />
                          <button
                            onClick={saveRenameFolder}
                            className="rounded p-1.5 text-primary hover:bg-primary/10"
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingFolderId(null)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedFolderId(folder.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent/40"
                        >
                          <FolderIcon size={16} className="shrink-0 text-blue-400" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {folder.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {folder.item_count}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card/50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FolderIcon size={16} className="shrink-0 text-blue-400" />
                <h4 className="truncate text-sm font-semibold">
                  {selectedFolder ? selectedFolder.name : 'No folder selected'}
                </h4>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {selectedFolder
                  ? `${selectedFolder.item_count.toLocaleString()} clips in folder`
                  : 'Select a folder to manage its clips.'}
              </div>
            </div>

            {selectedFolder && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => startRenameFolder(selectedFolder)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Rename folder"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDeleteFolder(selectedFolder.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Delete folder"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

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
                  ? 'Clear selection'
                  : 'Select all'}
              </button>

              {selectedClipCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-xs font-medium text-primary">
                    {selectedClipCount} selected
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => {
                        setMoveTargetClipId(moveTargetClipId === '__bulk__' ? null : '__bulk__');
                        setMoveSearch('');
                      }}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Move
                    </button>
                    {moveTargetClipId === '__bulk__' && renderMovePopover(selectedFolder.id)}
                  </div>
                  <button
                    onClick={handleBulkDelete}
                    className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Select clips for bulk actions</span>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedFolder ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <FolderIcon size={24} className="opacity-50" />
                <span>No folder selected</span>
              </div>
            ) : isSelectedFolderLoading && !selectedFolderClips ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Loading clips...
              </div>
            ) : !selectedFolderClips || selectedFolderClips.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Inbox size={20} className="opacity-50" />
                <span>No clips in this folder</span>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {selectedFolderClips.map((clip) => {
                  const isMoveOpen = moveTargetClipId === clip.id;
                  const isChecked = selectedClipIds.has(clip.id);
                  const previewText =
                    clip.clip_type === 'image' ? 'Image' : clip.preview?.trim() || '(empty)';

                  return (
                    <li
                      key={clip.id}
                      className={`group relative flex items-center gap-2 px-3 py-2 hover:bg-accent/30 ${
                        isChecked ? 'bg-primary/5' : ''
                      }`}
                    >
                      <button
                        onClick={() => toggleClipSelection(clip.id)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isChecked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-transparent hover:border-primary/60'
                        }`}
                        title="Select clip"
                      >
                        <Check size={11} />
                      </button>
                      <ClipTypeIcon type={clip.clip_type} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-foreground/90">{previewText}</div>
                        {clip.note && (
                          <div className="truncate text-[11px] italic text-muted-foreground">
                            {clip.note}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatRelativeTime(clip.created_at)}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveTargetClipId(isMoveOpen ? null : clip.id);
                            setMoveSearch('');
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Move to another folder"
                        >
                          <ArrowRightLeft size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClip(clip.id, selectedFolder.id);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete clip"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {isMoveOpen && renderMovePopover(selectedFolder.id, clip.id)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
