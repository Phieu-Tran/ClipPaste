import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import {
  ArrowRightLeft,
  Check,
  ClipboardList,
  Code,
  Copy,
  Database,
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import { ClipboardItem, DashboardStats, FolderItem } from '../../types';

const PAGE_SIZE = 80;

type LibraryMode = 'clips' | 'images';

interface LibraryTabProps {
  folders: FolderItem[];
  onDataChanged: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

function getImageSizeFromMeta(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const meta = JSON.parse(metadata);
    if (meta.width && meta.height) return `${meta.width} x ${meta.height}`;
  } catch {
    return null;
  }
  return null;
}

function ClipTypeIcon({ type, subtype }: { type: string; subtype: string | null }) {
  const className = 'shrink-0 text-muted-foreground';
  if (type === 'image') return <ImageIcon size={15} className="shrink-0 text-cyan-400" />;
  if (subtype === 'url') return <Link2 size={15} className="shrink-0 text-blue-400" />;
  if (type === 'html') return <Code size={15} className={className} />;
  if (type === 'rtf') return <Type size={15} className={className} />;
  if (type === 'file') return <FileIcon size={15} className={className} />;
  return <FileText size={15} className={className} />;
}

function clipKindLabel(clip: ClipboardItem): string {
  if (clip.clip_type === 'image') return getImageSizeFromMeta(clip.metadata) ?? 'Image';
  if (clip.subtype) return clip.subtype.toUpperCase();
  return clip.clip_type.toUpperCase();
}

function LibraryThumb({
  clip,
  onOpen,
  className = 'h-12 w-14 rounded-md',
  iconSize = 16,
}: {
  clip: ClipboardItem;
  onOpen: (clip: ClipboardItem) => void;
  className?: string;
  iconSize?: number;
}) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (clip.clip_type !== 'image') {
      setSrc('');
      return;
    }

    let cancelled = false;
    setSrc('');
    cmd
      .getClipImageDataUrl(clip.id, true)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });

    return () => {
      cancelled = true;
    };
  }, [clip.clip_type, clip.id]);

  if (clip.clip_type !== 'image') {
    return (
      <div
        className={clsx(
          'flex shrink-0 items-center justify-center border border-border bg-background/50',
          className
        )}
      >
        <ClipTypeIcon type={clip.clip_type} subtype={clip.subtype} />
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpen(clip)}
      className={clsx(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border bg-background/50 transition-colors hover:border-cyan-400/50',
        className
      )}
      title="Preview image"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={iconSize} className="text-muted-foreground/50" />
      )}
    </button>
  );
}

function ImagePreviewModal({ clip, onClose }: { clip: ClipboardItem; onClose: () => void }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSrc('');
    cmd
      .getClipImageDataUrl(clip.id, false)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch((e) => {
        if (!cancelled) toast.error(`Failed to load image: ${e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [clip.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full max-w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{clip.source_app ?? 'Image clip'}</div>
            <div className="text-xs text-muted-foreground">
              {clipKindLabel(clip)} - {formatRelativeTime(clip.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                cmd
                  .copyClip(clip.id)
                  .then(() => toast.success('Copied'))
                  .catch((e) => toast.error(`Failed: ${e}`));
              }}
              className="icon-button"
              title="Copy"
            >
              <Copy size={15} />
            </button>
            <button onClick={onClose} className="icon-button" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex min-h-[260px] min-w-[360px] items-center justify-center bg-black/30 p-3">
          {src ? (
            <img src={src} alt="" className="max-h-[72vh] max-w-[78vw] object-contain" />
          ) : (
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  Icon,
  label,
  value,
  iconClass,
  accentClass,
}: {
  Icon: ElementType;
  label: string;
  value: string;
  iconClass: string;
  accentClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card/60 p-3 shadow-sm shadow-black/5">
      <div className={clsx('absolute inset-y-0 left-0 w-1', accentClass)} />
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-background/60',
            iconClass
          )}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold leading-6">{value}</div>
        </div>
      </div>
    </div>
  );
}

export function LibraryTab({ folders, onDataChanged }: LibraryTabProps) {
  const [mode, setMode] = useState<LibraryMode>('clips');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [clips, setClips] = useState<ClipboardItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveFolderId, setMoveFolderId] = useState<string>('none');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [previewClip, setPreviewClip] = useState<ClipboardItem | null>(null);

  const customFolders = useMemo(() => folders.filter((folder) => !folder.is_system), [folders]);
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );
  const selectedCount = selectedIds.size;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const loadStats = useCallback(async (forceRefresh = false) => {
    try {
      const nextStats = await cmd.getDashboardStats({ forceRefresh });
      setStats(nextStats);
    } catch (e) {
      console.error('Failed to load library stats:', e);
    }
  }, []);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      try {
        const data = debouncedQuery
          ? await cmd.searchClips({
              query: debouncedQuery,
              filterId: folderId,
              typeFilter: mode === 'images' ? 'image' : null,
              limit: PAGE_SIZE,
              offset: nextOffset,
            })
          : mode === 'images'
            ? await cmd.getClipsByTypeFilter({
                typeFilter: 'image',
                folderId,
                limit: PAGE_SIZE,
                offset: nextOffset,
              })
            : await cmd.getClips({
                filterId: folderId,
                limit: PAGE_SIZE,
                offset: nextOffset,
                previewOnly: true,
              });

        setClips((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        toast.error(`Failed to load clips: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [debouncedQuery, folderId, mode]
  );

  const reload = useCallback(async () => {
    setOffset(0);
    setSelectedIds(new Set());
    await Promise.all([loadPage(0, false), loadStats(true), onDataChanged()]);
  }, [loadPage, loadStats, onDataChanged]);

  useEffect(() => {
    setOffset(0);
    setSelectedIds(new Set());
    loadPage(0, false);
  }, [loadPage]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectVisible = () => {
    setSelectedIds((prev) => {
      const visibleIds = clips.map((clip) => clip.id);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  };

  const handleLoadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    await loadPage(nextOffset, true);
  };

  const handleBulkPin = async (pinned: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      const count = await cmd.bulkSetPin(Array.from(selectedIds), pinned);
      toast.success(pinned ? `Pinned ${count} clips` : `Unpinned ${count} clips`);
      await reload();
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleBulkMove = async () => {
    if (selectedIds.size === 0) return;
    const target = moveFolderId === 'none' ? null : moveFolderId;
    try {
      await cmd.bulkMoveClips(Array.from(selectedIds), target);
      toast.success(target ? 'Clips moved' : 'Clips removed from folders');
      await reload();
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    const confirmed = confirm(`Delete ${ids.length} clip${ids.length === 1 ? '' : 's'}?`);
    if (!confirmed) return;
    try {
      const count = await cmd.bulkDeleteClips(ids);
      toast.success(`Deleted ${count} clips`);
      await reload();
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const handleCopy = async (clip: ClipboardItem) => {
    try {
      await cmd.copyClip(clip.id);
      toast.success('Copied');
    } catch (e) {
      toast.error(`Failed to copy: ${e}`);
    }
  };

  const handleTogglePin = async (clip: ClipboardItem) => {
    try {
      const pinned = await cmd.togglePin(clip.id);
      setClips((prev) =>
        prev.map((item) => (item.id === clip.id ? { ...item, is_pinned: pinned } : item))
      );
      await loadStats(true);
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  const allVisibleSelected = clips.length > 0 && clips.every((clip) => selectedIds.has(clip.id));
  const activeFolderName = folderId ? (folderById.get(folderId)?.name ?? 'Folder') : 'All folders';
  const modeLabel = mode === 'images' ? 'Images' : 'Clips';
  const loadedLabel =
    selectedCount > 0 ? `${selectedCount} selected` : `${clips.length} ${modeLabel.toLowerCase()}`;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      {previewClip && <ImagePreviewModal clip={previewClip} onClose={() => setPreviewClip(null)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          Icon={Database}
          label="Clips"
          value={stats?.total.toLocaleString() ?? '-'}
          iconClass="text-indigo-300"
          accentClass="bg-indigo-400"
        />
        <StatTile
          Icon={ImageIcon}
          label="Images"
          value={stats?.images.toLocaleString() ?? '-'}
          iconClass="text-cyan-300"
          accentClass="bg-cyan-400"
        />
        <StatTile
          Icon={Pin}
          label="Pinned"
          value={stats?.pinned.toLocaleString() ?? '-'}
          iconClass="text-amber-300"
          accentClass="bg-amber-400"
        />
        <StatTile
          Icon={HardDrive}
          label="Storage"
          value={stats ? formatBytes(stats.db_size + stats.images_size) : '-'}
          iconClass="text-emerald-300"
          accentClass="bg-emerald-400"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card/50 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/20 p-3">
          <div className="flex h-9 rounded-md border border-border bg-background/60 p-0.5">
            <button
              onClick={() => setMode('clips')}
              className={clsx(
                'flex items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
                mode === 'clips'
                  ? 'bg-accent text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ClipboardList size={14} />
              Clips
            </button>
            <button
              onClick={() => setMode('images')}
              className={clsx(
                'flex items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
                mode === 'images'
                  ? 'bg-accent text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ImageIcon size={14} />
              Images
            </button>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-md border border-border bg-background/70 pl-8 pr-8 text-sm outline-none transition-colors focus:border-primary/60"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={folderId ?? 'all'}
            onChange={(event) =>
              setFolderId(event.target.value === 'all' ? null : event.target.value)
            }
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
          >
            <option value="all">All folders</option>
            {customFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          <button onClick={reload} className="icon-button" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/10 px-3 py-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border bg-background/50 px-2 py-1 text-foreground">
            {modeLabel}
          </span>
          <span className="rounded-md border border-border bg-background/50 px-2 py-1">
            {activeFolderName}
          </span>
          {debouncedQuery && (
            <span className="min-w-0 truncate rounded-md border border-border bg-background/50 px-2 py-1">
              Search: {debouncedQuery}
            </span>
          )}
        </div>

        <div
          className={clsx(
            'flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 transition-colors',
            selectedCount > 0 ? 'bg-primary/[0.08]' : 'bg-background/20'
          )}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectVisible}
              className={clsx(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs',
                allVisibleSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              <Check size={13} />
              {allVisibleSelected ? 'Unselect' : 'Select'}
            </button>
            <span className="text-xs text-muted-foreground">{loadedLabel}</span>
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => handleBulkPin(true)}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pin size={12} />
                Pin
              </button>
              <button
                onClick={() => handleBulkPin(false)}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PinOff size={12} />
                Unpin
              </button>
              <select
                value={moveFolderId}
                onChange={(event) => setMoveFolderId(event.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
              >
                <option value="none">No folder</option>
                {customFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkMove}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowRightLeft size={12} />
                Move
              </button>
              <button
                onClick={() => handleDelete(Array.from(selectedIds))}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="min-h-[380px] overflow-hidden">
          {loading && clips.length === 0 ? (
            <div className="flex h-[380px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Loading
            </div>
          ) : clips.length === 0 ? (
            <div className="flex h-[380px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background/50">
                <Inbox size={22} className="opacity-60" />
              </div>
              <span>No {mode === 'images' ? 'images' : 'clips'}</span>
            </div>
          ) : mode === 'images' ? (
            <div className="max-h-[560px] overflow-y-auto p-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3">
                {clips.map((clip) => {
                  const checked = selectedIds.has(clip.id);
                  const folderName = clip.folder_id
                    ? (folderById.get(clip.folder_id)?.name ?? 'Folder')
                    : 'No folder';

                  return (
                    <article
                      key={clip.id}
                      className={clsx(
                        'group relative overflow-hidden rounded-lg border bg-background/45 transition-colors',
                        checked
                          ? 'border-primary/60 bg-primary/[0.06]'
                          : 'border-border hover:border-cyan-400/40 hover:bg-accent/20'
                      )}
                    >
                      <button
                        onClick={() => toggleSelection(clip.id)}
                        className={clsx(
                          'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border shadow-sm',
                          checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-white/30 bg-background/80 text-transparent hover:text-foreground'
                        )}
                        title="Select image"
                      >
                        <Check size={12} />
                      </button>

                      <div className="relative bg-black/20">
                        <LibraryThumb
                          clip={clip}
                          onOpen={setPreviewClip}
                          className="h-28 w-full rounded-none border-0"
                          iconSize={22}
                        />
                        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            onClick={() => handleTogglePin(clip)}
                            className="rounded bg-background/85 p-1 text-muted-foreground shadow-sm hover:text-foreground"
                            title={clip.is_pinned ? 'Unpin' : 'Pin'}
                          >
                            {clip.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                          <button
                            onClick={() => handleCopy(clip)}
                            className="rounded bg-background/85 p-1 text-muted-foreground shadow-sm hover:text-foreground"
                            title="Copy"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete([clip.id])}
                            className="rounded bg-background/85 p-1 text-muted-foreground shadow-sm hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 p-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-foreground/90">
                            {clip.source_app ?? 'Image clip'}
                          </span>
                          {clip.is_pinned && <Pin size={10} className="shrink-0 text-amber-400" />}
                          {clip.is_sensitive && (
                            <ShieldAlert size={10} className="shrink-0 text-rose-400" />
                          )}
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">{clipKindLabel(clip)}</span>
                          <span className="shrink-0 tabular-nums">
                            {formatRelativeTime(clip.created_at)}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <FolderIcon size={11} className="shrink-0" />
                          <span className="truncate">{folderName}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="flex items-center justify-center p-3">
                {hasMore ? (
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="btn btn-secondary h-8 text-xs"
                  >
                    {loading ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
                    Load more
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">End</span>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <div className="grid grid-cols-[24px_60px_minmax(0,1fr)_120px_116px_104px] gap-3 border-b border-border bg-background/30 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                <span />
                <span>Type</span>
                <span>Content</span>
                <span>Details</span>
                <span>Folder</span>
                <span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-border/50">
                {clips.map((clip) => {
                  const checked = selectedIds.has(clip.id);
                  const folderName = clip.folder_id
                    ? (folderById.get(clip.folder_id)?.name ?? 'Folder')
                    : 'No folder';
                  const preview =
                    clip.clip_type === 'image' ? 'Image clip' : clip.preview?.trim() || '(empty)';

                  return (
                    <li
                      key={clip.id}
                      className={clsx(
                        'group grid grid-cols-[24px_60px_minmax(0,1fr)_120px_116px_104px] items-center gap-3 border-l-2 border-transparent px-3 py-2.5 transition-colors hover:bg-accent/30',
                        checked && 'border-l-primary bg-primary/[0.07]'
                      )}
                    >
                      <button
                        onClick={() => toggleSelection(clip.id)}
                        className={clsx(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-transparent hover:border-primary/60'
                        )}
                        title="Select clip"
                      >
                        <Check size={11} />
                      </button>

                      <LibraryThumb
                        clip={clip}
                        onOpen={setPreviewClip}
                        className="h-12 w-14 rounded-md"
                      />

                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <ClipTypeIcon type={clip.clip_type} subtype={clip.subtype} />
                          <div className="truncate text-sm text-foreground/90">{preview}</div>
                          {clip.is_pinned && <Pin size={11} className="shrink-0 text-amber-400" />}
                          {clip.is_sensitive && (
                            <ShieldAlert size={11} className="shrink-0 text-rose-400" />
                          )}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">{clip.source_app ?? 'Unknown app'}</span>
                          {clip.note && <span className="truncate italic">{clip.note}</span>}
                        </div>
                      </div>

                      <div className="min-w-0 text-xs text-muted-foreground">
                        <div className="truncate">{clipKindLabel(clip)}</div>
                        <div className="truncate text-[10px]">
                          {formatRelativeTime(clip.created_at)}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <FolderIcon size={12} className="shrink-0" />
                        <span className="truncate">{folderName}</span>
                      </div>

                      <div className="flex items-center justify-end gap-0.5 opacity-40 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          onClick={() => handleTogglePin(clip)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title={clip.is_pinned ? 'Unpin' : 'Pin'}
                        >
                          {clip.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                          onClick={() => handleCopy(clip)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Copy"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete([clip.id])}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-center p-3">
                {hasMore ? (
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="btn btn-secondary h-8 text-xs"
                  >
                    {loading ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
                    Load more
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">End</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
