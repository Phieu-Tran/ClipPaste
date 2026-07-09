import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  ClipboardList,
  Code,
  Copy,
  Database,
  Download,
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  Link2,
  ListFilter,
  Loader2,
  Maximize2,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import { evictClipImageDataUrl, loadClipImageDataUrl } from '../../imageQueue';
import { ClipboardItem, DashboardStats, FolderItem } from '../../types';
import { formatBytes, formatRelativeTime } from '../../utils/format';

const PAGE_SIZE = 80;
const IMAGE_CARD_MIN_WIDTH = 158;
const IMAGE_GRID_GAP = 12;
const IMAGE_ROW_HEIGHT = 184;
const CLIP_ROW_HEIGHT = 68;

type LibraryMode = 'clips' | 'images';
type LibraryTypeFilter = 'all' | 'text' | 'url' | 'code' | 'json' | 'file' | 'html' | 'rtf';
type LibraryPinFilter = 'all' | 'pinned' | 'unpinned';
type LibraryDateFilter = 'all' | 'today' | '7d' | '30d';
type LibrarySort = 'newest' | 'oldest' | 'largest' | 'most_used' | 'smart';

const TYPE_FILTER_OPTIONS: { value: LibraryTypeFilter; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'text', label: 'Text' },
  { value: 'url', label: 'Links' },
  { value: 'code', label: 'Code' },
  { value: 'json', label: 'JSON' },
  { value: 'file', label: 'Files' },
  { value: 'html', label: 'HTML' },
  { value: 'rtf', label: 'RTF' },
];

const PIN_FILTER_OPTIONS: { value: LibraryPinFilter; label: string }[] = [
  { value: 'all', label: 'All pins' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'unpinned', label: 'Unpinned' },
];

const DATE_FILTER_OPTIONS: { value: LibraryDateFilter; label: string }[] = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'largest', label: 'Largest' },
  { value: 'most_used', label: 'Most used' },
  { value: 'smart', label: 'Smart' },
];

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  details?: string[];
  action: () => Promise<void>;
}

interface LibraryTabProps {
  folders: FolderItem[];
  onDataChanged: () => Promise<void>;
  requestConfirm: (options: ConfirmOptions) => void;
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
    loadClipImageDataUrl(clip.id, true)
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

function ImagePreviewModal({
  clip,
  imageClips,
  onSelectClip,
  onClose,
}: {
  clip: ClipboardItem;
  imageClips: ClipboardItem[];
  onSelectClip: (clip: ClipboardItem) => void;
  onClose: () => void;
}) {
  const [src, setSrc] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });

  const activeIndex = imageClips.findIndex((item) => item.id === clip.id);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < imageClips.length - 1;

  const setClampedZoom = (next: number) => {
    const value = Math.min(6, Math.max(0.25, Number(next.toFixed(2))));
    setZoom(value);
    if (value <= 1) setPan({ x: 0, y: 0 });
  };

  const fitImage = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const showActualSize = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const goToImage = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = activeIndex + direction;
      const nextClip = imageClips[nextIndex];
      if (nextClip) onSelectClip(nextClip);
    },
    [activeIndex, imageClips, onSelectClip]
  );

  useEffect(() => {
    let cancelled = false;
    setSrc('');
    fitImage();
    loadClipImageDataUrl(clip.id, false)
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goToImage(-1);
      if (event.key === 'ArrowRight') goToImage(1);
      if ((event.ctrlKey || event.metaKey) && event.key === '0') fitImage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToImage, onClose]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      setPan({
        x: dragRef.current.panX + event.clientX - dragRef.current.startX,
        y: dragRef.current.panY + event.clientY - dragRef.current.startY,
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const handleSaveImage = async () => {
    try {
      const path = await cmd.saveClipImageAs(clip.id);
      toast.success(`Saved to ${path}`);
    } catch (e) {
      if (String(e) !== 'Save cancelled') {
        toast.error(`Failed to save: ${e}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[min(92vh,900px)] w-[min(96vw,1280px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{clip.source_app ?? 'Image clip'}</div>
            <div className="text-xs text-muted-foreground">
              {clipKindLabel(clip)} - {formatRelativeTime(clip.created_at)}
              {activeIndex >= 0 && imageClips.length > 1
                ? ` - ${activeIndex + 1}/${imageClips.length}`
                : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => goToImage(-1)}
              disabled={!canGoPrev}
              className="icon-button disabled:opacity-40"
              title="Previous image"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => goToImage(1)}
              disabled={!canGoNext}
              className="icon-button disabled:opacity-40"
              title="Next image"
            >
              <ChevronRight size={16} />
            </button>
            <span className="mx-1 h-5 w-px bg-border" />
            <button
              onClick={() => setClampedZoom(zoom - 0.25)}
              className="icon-button"
              title="Zoom out"
            >
              <ZoomOut size={15} />
            </button>
            <span className="min-w-[46px] text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setClampedZoom(zoom + 0.25)}
              className="icon-button"
              title="Zoom in"
            >
              <ZoomIn size={15} />
            </button>
            <button onClick={fitImage} className="icon-button" title="Fit">
              <Maximize2 size={15} />
            </button>
            <button onClick={showActualSize} className="icon-button" title="100%">
              <span className="text-[11px] font-semibold">1:1</span>
            </button>
            <span className="mx-1 h-5 w-px bg-border" />
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
            <button onClick={handleSaveImage} className="icon-button" title="Save as">
              <Download size={15} />
            </button>
            <button onClick={onClose} className="icon-button" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/35"
          onWheel={(event) => {
            if (!src) return;
            event.preventDefault();
            setClampedZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15));
          }}
          onMouseDown={(event) => {
            if (zoom <= 1 || !src) return;
            event.preventDefault();
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
            setDragging(true);
          }}
          onDoubleClick={() => (zoom === 1 ? setClampedZoom(2) : fitImage())}
        >
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className={clsx(
                'max-h-full max-w-full select-none object-contain transition-transform duration-75',
                zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
              )}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            />
          ) : (
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{clip.preview || 'Image clip'}</span>
          <span className="shrink-0 tabular-nums">{clip.created_at}</span>
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

export function LibraryTab({ folders, onDataChanged, requestConfirm }: LibraryTabProps) {
  const [mode, setMode] = useState<LibraryMode>('clips');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>('all');
  const [pinFilter, setPinFilter] = useState<LibraryPinFilter>('all');
  const [dateFilter, setDateFilter] = useState<LibraryDateFilter>('all');
  const [sortOrder, setSortOrder] = useState<LibrarySort>('newest');
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
  const loadSeqRef = useRef(0);
  const loadingRef = useRef(false);
  const imageScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [imageGridWidth, setImageGridWidth] = useState(0);

  const customFolders = useMemo(() => folders.filter((folder) => !folder.is_system), [folders]);
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );
  const selectedCount = selectedIds.size;
  const hasActiveFilters =
    typeFilter !== 'all' || pinFilter !== 'all' || dateFilter !== 'all' || sortOrder !== 'newest';
  const imageClips = useMemo(() => clips.filter((clip) => clip.clip_type === 'image'), [clips]);
  const imageGridColumns = useMemo(() => {
    const availableWidth = Math.max(IMAGE_CARD_MIN_WIDTH, imageGridWidth - 24);
    return Math.max(
      1,
      Math.floor((availableWidth + IMAGE_GRID_GAP) / (IMAGE_CARD_MIN_WIDTH + IMAGE_GRID_GAP))
    );
  }, [imageGridWidth]);
  const imageRowCount = Math.ceil(clips.length / imageGridColumns);
  const imageVirtualizer = useVirtualizer({
    count: imageRowCount,
    getScrollElement: () => imageScrollRef.current,
    estimateSize: () => IMAGE_ROW_HEIGHT,
    overscan: 3,
  });
  const listVirtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => CLIP_ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (mode === 'images') {
      setTypeFilter('all');
    }
  }, [mode]);

  const loadStats = useCallback(async (forceRefresh = false) => {
    try {
      const nextStats = await cmd.getDashboardStats({ forceRefresh });
      setStats(nextStats);
    } catch (e) {
      console.error('Failed to load library stats:', e);
    }
  }, []);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean): Promise<boolean> => {
      if (append && loadingRef.current) return false;

      const loadSeq = ++loadSeqRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const data = await cmd.getLibraryClips({
          query: debouncedQuery || null,
          folderId,
          typeFilter: mode === 'images' ? 'image' : typeFilter,
          pinFilter,
          dateFilter,
          sort: sortOrder,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        if (loadSeq !== loadSeqRef.current) return false;
        setClips((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
        return true;
      } catch (e) {
        if (loadSeq !== loadSeqRef.current) return false;
        toast.error(`Failed to load clips: ${e}`);
        return false;
      } finally {
        if (loadSeq === loadSeqRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [dateFilter, debouncedQuery, folderId, mode, pinFilter, sortOrder, typeFilter]
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

  useEffect(() => {
    if (mode !== 'images') return;
    const node = imageScrollRef.current;
    if (!node) return;

    const updateWidth = () => setImageGridWidth(node.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (
      folderId &&
      folderId !== '__smart__' &&
      folderId !== '__frequent__' &&
      !folders.some((folder) => folder.id === folderId)
    ) {
      setFolderId(null);
    }
  }, [folderId, folders]);

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
    if (loadingRef.current || loading || !hasMore) return;
    const nextOffset = offset + PAGE_SIZE;
    const loaded = await loadPage(nextOffset, true);
    if (loaded) setOffset(nextOffset);
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
    requestConfirm({
      title: ids.length === 1 ? 'Delete clip' : 'Delete clips',
      message:
        ids.length === 1
          ? 'Delete this clip from local history? Image files attached to this clip will also be removed.'
          : `Delete ${ids.length} clips from local history? Image files attached to these clips will also be removed.`,
      confirmText: 'Delete',
      variant: 'danger',
      details:
        ids.length > 1
          ? [`${ids.length} selected clips`, 'Pinned clips are included in this action.']
          : undefined,
      action: async () => {
        try {
          const count = await cmd.bulkDeleteClips(ids);
          ids.forEach(evictClipImageDataUrl);
          toast.success(`Deleted ${count} clips`);
          await reload();
        } catch (e) {
          toast.error(`Failed: ${e}`);
        }
      },
    });
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
  const activeFolderName =
    folderId === '__smart__'
      ? 'Smart'
      : folderId === '__frequent__'
        ? 'Frequent'
        : folderId
          ? (folderById.get(folderId)?.name ?? 'Folder')
          : 'All folders';
  const modeLabel = mode === 'images' ? 'Images' : 'Clips';
  const loadedLabel =
    selectedCount > 0 ? `${selectedCount} selected` : `${clips.length} ${modeLabel.toLowerCase()}`;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      {previewClip && (
        <ImagePreviewModal
          clip={previewClip}
          imageClips={imageClips}
          onSelectClip={setPreviewClip}
          onClose={() => setPreviewClip(null)}
        />
      )}

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card/50 shadow-sm shadow-black/5">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/20 p-3">
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
            onChange={(event) => {
              const nextFolderId = event.target.value === 'all' ? null : event.target.value;
              setFolderId(nextFolderId);
              if (nextFolderId === '__smart__') setSortOrder('smart');
              if (nextFolderId === '__frequent__') setSortOrder('most_used');
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
          >
            <option value="all">All folders</option>
            <option value="__smart__">Smart</option>
            <option value="__frequent__">Frequent</option>
            {customFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          {mode === 'clips' && (
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as LibraryTypeFilter)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
            >
              {TYPE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={pinFilter}
            onChange={(event) => setPinFilter(event.target.value as LibraryPinFilter)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {PIN_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as LibraryDateFilter)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {DATE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as LibrarySort)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setTypeFilter('all');
                setPinFilter('all');
                setDateFilter('all');
                setSortOrder('newest');
              }}
              className="icon-button"
              title="Clear filters"
            >
              <ListFilter size={15} />
            </button>
          )}

          <button onClick={reload} className="icon-button" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/10 px-3 py-2 text-xs text-muted-foreground">
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
          {mode === 'clips' && typeFilter !== 'all' && (
            <span className="rounded-md border border-border bg-background/50 px-2 py-1">
              {TYPE_FILTER_OPTIONS.find((option) => option.value === typeFilter)?.label}
            </span>
          )}
          {pinFilter !== 'all' && (
            <span className="rounded-md border border-border bg-background/50 px-2 py-1">
              {PIN_FILTER_OPTIONS.find((option) => option.value === pinFilter)?.label}
            </span>
          )}
          {dateFilter !== 'all' && (
            <span className="rounded-md border border-border bg-background/50 px-2 py-1">
              {DATE_FILTER_OPTIONS.find((option) => option.value === dateFilter)?.label}
            </span>
          )}
          {sortOrder !== 'newest' && (
            <span className="rounded-md border border-border bg-background/50 px-2 py-1">
              Sort: {SORT_OPTIONS.find((option) => option.value === sortOrder)?.label}
            </span>
          )}
        </div>

        <div
          className={clsx(
            'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 transition-colors',
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

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading && clips.length === 0 ? (
            <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Loading
            </div>
          ) : clips.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background/50">
                <Inbox size={22} className="opacity-60" />
              </div>
              <span>No {mode === 'images' ? 'images' : 'clips'}</span>
            </div>
          ) : mode === 'images' ? (
            <div ref={imageScrollRef} className="h-full overflow-y-auto p-3">
              <div className="relative" style={{ height: `${imageVirtualizer.getTotalSize()}px` }}>
                {imageVirtualizer.getVirtualItems().map((virtualRow) => {
                  const start = virtualRow.index * imageGridColumns;
                  const rowClips = clips.slice(start, start + imageGridColumns);

                  return (
                    <div
                      key={virtualRow.key}
                      ref={imageVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 top-0 grid w-full gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${imageGridColumns}, minmax(0, 1fr))`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {rowClips.map((clip, columnIndex) => {
                        const displayIndex = start + columnIndex + 1;
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
                            <span
                              className="absolute left-8 top-2 z-10 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground shadow-sm"
                              title={`Clip #${displayIndex}`}
                            >
                              #{displayIndex}
                            </span>

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
                                {clip.is_pinned && (
                                  <Pin size={10} className="shrink-0 text-amber-400" />
                                )}
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
            <div className="flex h-full min-h-0 flex-col overflow-x-auto">
              <div className="flex min-h-0 min-w-[780px] flex-1 flex-col">
                <div className="grid shrink-0 grid-cols-[24px_42px_58px_minmax(220px,1fr)_88px_120px_88px] gap-3 border-b border-border bg-background/30 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                  <span />
                  <span>#</span>
                  <span>Type</span>
                  <span>Content</span>
                  <span>Details</span>
                  <span>Folder</span>
                  <span className="text-right">Actions</span>
                </div>
                <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  <ul
                    className="relative"
                    style={{ height: `${listVirtualizer.getTotalSize()}px` }}
                  >
                    {listVirtualizer.getVirtualItems().map((virtualRow) => {
                      const clip = clips[virtualRow.index];
                      if (!clip) return null;
                      const checked = selectedIds.has(clip.id);
                      const folderName = clip.folder_id
                        ? (folderById.get(clip.folder_id)?.name ?? 'Folder')
                        : 'No folder';
                      const preview =
                        clip.clip_type === 'image'
                          ? 'Image clip'
                          : clip.preview?.trim() || '(empty)';

                      return (
                        <li
                          key={clip.id}
                          ref={listVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className={clsx(
                            'group absolute left-0 top-0 grid w-full grid-cols-[24px_42px_58px_minmax(220px,1fr)_88px_120px_88px] items-center gap-3 border-b border-l-2 border-border/50 border-l-transparent px-3 py-2.5 transition-colors hover:bg-accent/30',
                            checked && 'border-l-primary bg-primary/[0.07]'
                          )}
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
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
                          <span
                            className="text-xs font-semibold tabular-nums text-muted-foreground/70"
                            title={`Clip #${virtualRow.index + 1}`}
                          >
                            #{virtualRow.index + 1}
                          </span>

                          <LibraryThumb
                            clip={clip}
                            onOpen={setPreviewClip}
                            className="h-12 w-14 rounded-md"
                          />

                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <ClipTypeIcon type={clip.clip_type} subtype={clip.subtype} />
                              <div className="truncate text-sm text-foreground/90">{preview}</div>
                              {clip.is_pinned && (
                                <Pin size={11} className="shrink-0 text-amber-400" />
                              )}
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
                </div>
                <div className="flex shrink-0 items-center justify-center border-t border-border p-3">
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
