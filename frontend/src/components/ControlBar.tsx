import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { FolderItem } from '../types';
import {
  Search,
  Plus,
  MoreHorizontal,
  X,
  Layers,
  FileText,
  Image,
  Link,
  EyeOff,
  Flame,
  Sparkles,
  Mail,
  Palette,
  FolderOpen,
  Phone,
  Braces,
  Code2,
  StickyNote,
  Network,
} from 'lucide-react';
import { clsx } from 'clsx';
import { FOLDER_ICON_MAP } from './FolderModal';
import { type LucideIcon } from 'lucide-react';

const FOLDER_COLORS_LIGHT = [
  {
    active: 'bg-red-600 text-white ring-2 ring-red-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-red-400 text-white hover:bg-red-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-orange-600 text-white ring-2 ring-orange-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-orange-400 text-white hover:bg-orange-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-amber-600 text-white ring-2 ring-amber-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-amber-400 text-white hover:bg-amber-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-green-600 text-white ring-2 ring-green-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-green-400 text-white hover:bg-green-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-emerald-600 text-white ring-2 ring-emerald-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-emerald-400 text-white hover:bg-emerald-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-teal-600 text-white ring-2 ring-teal-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-teal-400 text-white hover:bg-teal-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-cyan-600 text-white ring-2 ring-cyan-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-cyan-400 text-white hover:bg-cyan-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-sky-600 text-white ring-2 ring-sky-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-sky-400 text-white hover:bg-sky-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-blue-600 text-white ring-2 ring-blue-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-blue-400 text-white hover:bg-blue-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-indigo-600 text-white ring-2 ring-indigo-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-indigo-400 text-white hover:bg-indigo-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-violet-600 text-white ring-2 ring-violet-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-violet-400 text-white hover:bg-violet-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-purple-600 text-white ring-2 ring-purple-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-purple-400 text-white hover:bg-purple-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-fuchsia-600 text-white ring-2 ring-fuchsia-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-fuchsia-400 text-white hover:bg-fuchsia-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-pink-600 text-white ring-2 ring-pink-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-pink-400 text-white hover:bg-pink-500 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-rose-600 text-white ring-2 ring-rose-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-rose-400 text-white hover:bg-rose-500 hover:text-white drop-shadow-sm',
  },
];

const FOLDER_COLORS_DARK = [
  {
    active: 'bg-red-400/30 text-white ring-2 ring-red-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-red-400/20 text-white/90 hover:bg-red-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-orange-400/30 text-white ring-2 ring-orange-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-orange-400/20 text-white/90 hover:bg-orange-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-amber-400/30 text-white ring-2 ring-amber-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-amber-400/20 text-white/90 hover:bg-amber-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-green-400/30 text-white ring-2 ring-green-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-green-400/20 text-white/90 hover:bg-green-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-emerald-400/30 text-white ring-2 ring-emerald-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-emerald-400/20 text-white/90 hover:bg-emerald-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-teal-400/30 text-white ring-2 ring-teal-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-teal-400/20 text-white/90 hover:bg-teal-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-cyan-400/30 text-white ring-2 ring-cyan-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-cyan-400/20 text-white/90 hover:bg-cyan-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-sky-400/30 text-white ring-2 ring-sky-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-sky-400/20 text-white/90 hover:bg-sky-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-blue-400/30 text-white ring-2 ring-blue-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-blue-400/20 text-white/90 hover:bg-blue-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-indigo-400/30 text-white ring-2 ring-indigo-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-indigo-400/20 text-white/90 hover:bg-indigo-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-violet-400/30 text-white ring-2 ring-violet-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-violet-400/20 text-white/90 hover:bg-violet-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-purple-400/30 text-white ring-2 ring-purple-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-purple-400/20 text-white/90 hover:bg-purple-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-fuchsia-400/30 text-white ring-2 ring-fuchsia-500/50 font-bold drop-shadow-sm',
    inactive:
      'bg-fuchsia-400/20 text-white/90 hover:bg-fuchsia-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-pink-400/30 text-white ring-2 ring-pink-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-pink-400/20 text-white/90 hover:bg-pink-400/30 hover:text-white drop-shadow-sm',
  },
  {
    active: 'bg-rose-400/30 text-white ring-2 ring-rose-500/50 font-bold drop-shadow-sm',
    inactive: 'bg-rose-400/20 text-white/90 hover:bg-rose-400/30 hover:text-white drop-shadow-sm',
  },
];

const COLOR_KEY_TO_INDEX: Record<string, number> = {
  red: 0,
  orange: 1,
  amber: 2,
  green: 3,
  emerald: 4,
  teal: 5,
  cyan: 6,
  sky: 7,
  blue: 8,
  indigo: 9,
  violet: 10,
  purple: 11,
  fuchsia: 12,
  pink: 13,
  rose: 14,
};

/** All clip filters — compact inline row */
const CLIP_FILTERS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'text', label: 'Text', Icon: FileText },
  { key: 'image', label: 'Image', Icon: Image },
  { key: 'url', label: 'URL', Icon: Link },
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'color', label: 'Color', Icon: Palette },
  { key: 'path', label: 'Path', Icon: FolderOpen },
  { key: 'phone', label: 'Phone', Icon: Phone },
  { key: 'ip', label: 'IP', Icon: Network },
  { key: 'json', label: 'JSON', Icon: Braces },
  { key: 'code', label: 'Code', Icon: Code2 },
];

interface ControlBarProps {
  folders: FolderItem[];
  selectedFolder: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSearchClick: () => void;
  onAddClick: () => void;
  onMoreClick: () => void;
  showSearch: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isDragging: boolean;
  dragTargetFolderId: string | null;
  onDragHover: (folderId: string | null) => void;
  onDragLeave: () => void;
  totalClipCount: number;
  onFolderContextMenu?: (e: React.MouseEvent, folderId: string) => void;
  onReorderFolders?: (folderIds: string[]) => void;
  onFolderHover?: (folderId: string | null) => void;
  onFolderHoverEnd?: () => void;
  theme?: 'light' | 'dark';
  clipFilter?: string | null;
  onClipFilterChange?: (filter: string | null) => void;
  isIncognito?: boolean;
  onToggleIncognito?: () => void;
  onToggleScratchpad?: () => void;
  isScratchpadVisible?: boolean;
  scratchpadFeedback?: 'on' | 'off' | null;
  resultCount?: number;
  resultHasMore?: boolean;
}

export const ControlBar = React.forwardRef<HTMLInputElement, ControlBarProps>(function ControlBar(
  {
    folders,
    selectedFolder,
    onSelectFolder,
    onSearchClick,
    onAddClick,
    onMoreClick,
    showSearch,
    searchQuery,
    onSearchChange,
    isDragging,
    dragTargetFolderId,
    onDragHover,
    onDragLeave,
    totalClipCount,
    onFolderContextMenu,
    onReorderFolders,
    onFolderHover,
    onFolderHoverEnd,
    theme = 'dark',
    clipFilter,
    onClipFilterChange,
    isIncognito,
    onToggleIncognito,
    onToggleScratchpad,
    isScratchpadVisible,
    scratchpadFeedback,
    resultCount,
    resultHasMore,
  },
  ref
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sliding highlight for the type-filter pills (segmented-control style)
  const filterListRef = useRef<HTMLDivElement>(null);
  const [pillHighlight, setPillHighlight] = useState({ left: 0, width: 0, visible: false });

  useLayoutEffect(() => {
    const list = filterListRef.current;
    if (!list) return;
    const active = clipFilter
      ? (list.querySelector(`[data-pill-key="${clipFilter}"]`) as HTMLElement | null)
      : null;
    if (active) {
      setPillHighlight({ left: active.offsetLeft, width: active.offsetWidth, visible: true });
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      setPillHighlight((prev) => ({ ...prev, visible: false }));
    }
  }, [clipFilter, showSearch]);

  // Simulated folder drag state
  const [folderDragId, setFolderDragId] = useState<string | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [folderDropSide, setFolderDropSide] = useState<'left' | 'right'>('left');
  const [folderDragPos, setFolderDragPos] = useState({ x: 0, y: 0 });
  const folderDragRef = useRef<{
    id: string;
    startX: number;
    started: boolean;
  } | null>(null);

  // Refs for dynamic values used in global mouse handlers (avoids re-subscribing)
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const folderDropTargetIdRef = useRef(folderDropTargetId);
  folderDropTargetIdRef.current = folderDropTargetId;
  const folderDropSideRef = useRef(folderDropSide);
  folderDropSideRef.current = folderDropSide;
  const onReorderFoldersRef = useRef(onReorderFolders);
  onReorderFoldersRef.current = onReorderFolders;

  // Simulated folder drag: global mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = folderDragRef.current;
      if (!drag) return;

      if (!drag.started) {
        if (Math.abs(e.clientX - drag.startX) > 5) {
          drag.started = true;
          setFolderDragId(drag.id);
          setFolderDragPos({ x: e.clientX, y: e.clientY });
        }
        return;
      }

      setFolderDragPos({ x: e.clientX, y: e.clientY });

      const container = scrollContainerRef.current;
      if (!container) return;
      const buttons = container.querySelectorAll('[data-folder-id]');
      let hoveredId: string | null = null;
      let side: 'left' | 'right' = 'left';
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          hoveredId = btn.getAttribute('data-folder-id');
          // Determine if cursor is on left or right half of the button
          side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
        }
      });
      setFolderDropTargetId(hoveredId && hoveredId !== drag.id ? hoveredId : null);
      setFolderDropSide(side);
    };

    const handleMouseUp = () => {
      const drag = folderDragRef.current;
      if (drag?.started && folderDropTargetIdRef.current && onReorderFoldersRef.current) {
        const folderIds = foldersRef.current.map((f) => f.id);
        const dragIdx = folderIds.indexOf(drag.id);
        const dropIdx = folderIds.indexOf(folderDropTargetIdRef.current);
        if (dragIdx !== -1 && dropIdx !== -1) {
          const reordered = [...folderIds];
          const [dragged] = reordered.splice(dragIdx, 1);
          // Insert after if dropping on right side, before if left side
          const adjustedIdx = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
          const insertIdx = folderDropSideRef.current === 'right' ? adjustedIdx + 1 : adjustedIdx;
          reordered.splice(insertIdx, 0, dragged);
          onReorderFoldersRef.current(reordered);
        }
      }
      folderDragRef.current = null;
      setFolderDragId(null);
      setFolderDropTargetId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // Subscribe once — dynamic values accessed via refs

  // Scroll selected folder tab into view when selection changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector('[data-folder-active="true"]') as HTMLElement | null;
    if (!activeBtn) return;
    const containerLeft = container.scrollLeft;
    const containerRight = containerLeft + container.clientWidth;
    const btnLeft = activeBtn.offsetLeft;
    const btnRight = btnLeft + activeBtn.offsetWidth;
    if (btnLeft < containerLeft) {
      container.scrollTo({ left: btnLeft - 8, behavior: 'smooth' });
    } else if (btnRight > containerRight) {
      container.scrollTo({ left: btnRight - container.clientWidth + 8, behavior: 'smooth' });
    }
  }, [selectedFolder]);

  const allCategories = useMemo(() => {
    const raw: {
      id: string | null;
      name: string;
      count: number;
      color?: string | null;
      icon?: string | null;
      isVirtual?: boolean;
    }[] = [
      { id: null, name: 'All', count: totalClipCount, icon: null },
      { id: '__frequent__', name: 'Frequent', count: 0, icon: null, color: null, isVirtual: true },
      { id: '__smart__', name: 'Smart', count: 0, icon: null, color: null, isVirtual: true },
      ...folders.map((f) => ({ ...f, count: f.item_count })),
    ];
    if (!searchQuery.trim()) return raw;
    return raw.filter(
      (cat) => cat.id === null || cat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [folders, totalClipCount, searchQuery]);

  const handleMouseEnter = (folderId: string | null) => {
    if (isDragging) {
      onDragHover(folderId);
      return;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (folderId !== selectedFolder && onFolderHover) {
      hoverTimerRef.current = setTimeout(() => {
        onFolderHover(folderId);
      }, 200);
    } else if (folderId === selectedFolder) {
      onFolderHoverEnd?.();
    }
  };

  const handleMouseLeave = () => {
    onDragLeave();
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    onFolderHoverEnd?.();
  };

  const getFolderColor = useCallback(
    (name: string, colorKey?: string | null) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colors = theme === 'light' ? FOLDER_COLORS_LIGHT : FOLDER_COLORS_DARK;
      if (colorKey && colorKey in COLOR_KEY_TO_INDEX) {
        return colors[COLOR_KEY_TO_INDEX[colorKey]];
      }
      return colors[Math.abs(hash) % colors.length];
    },
    [theme]
  );
  const activeFilter = useMemo(
    () => CLIP_FILTERS.find((filter) => filter.key === clipFilter),
    [clipFilter]
  );
  const hasSearchQuery = searchQuery.trim().length > 0;
  const showResultCount = resultCount !== undefined && (hasSearchQuery || activeFilter);

  return (
    <div className="drag-area relative z-[70] flex min-h-[52px] items-center gap-3 overflow-visible border-b border-border/50 bg-gradient-to-r from-background/95 via-background/90 to-background/95 px-6 py-2 backdrop-blur-sm">
      {/* Search Toggle / Input */}
      <div
        className={clsx(
          'no-drag flex items-center transition-all duration-300',
          showSearch ? 'w-[280px]' : 'w-10'
        )}
      >
        {showSearch ? (
          <div className="animate-in fade-in slide-in-from-left-2 flex w-full items-center gap-2 rounded-full border border-border bg-input px-3 py-1.5 duration-300">
            <Search size={18} className="text-blue-400" />
            <input
              ref={ref}
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search clips..."
              className="flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={onSearchClick}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onSearchClick}
            className="rounded-lg p-2 text-blue-400 transition-colors hover:bg-blue-500/10"
          >
            <Search size={20} />
          </button>
        )}
      </div>

      {/* Clip Filters */}
      {(showSearch || activeFilter) && (
        <div
          className="no-drag no-scrollbar flex h-8 max-w-[174px] shrink-0 items-center overflow-x-auto rounded-full border border-border/60 bg-card/90 px-1.5"
          role="toolbar"
          aria-label="Filter clips"
        >
          <div ref={filterListRef} className="relative flex items-center gap-1">
            {/* Sliding highlight behind the active pill */}
            <span
              aria-hidden
              className="transition-spring pointer-events-none absolute top-1/2 h-6 -translate-y-1/2 rounded-full bg-primary shadow-sm transition-[transform,width,opacity] duration-300"
              style={{
                width: pillHighlight.width,
                transform: `translate(${pillHighlight.left}px, -50%)`,
                opacity: pillHighlight.visible ? 1 : 0,
              }}
            />
            {CLIP_FILTERS.map(({ key, label, Icon }) => (
              <button
                key={key}
                data-pill-key={key}
                onClick={() => onClipFilterChange?.(clipFilter === key ? null : key)}
                title={label}
                aria-label={`Filter by ${label}`}
                aria-pressed={clipFilter === key}
                className={clsx(
                  'relative z-10 flex h-6 min-w-6 items-center justify-center rounded-full transition-colors',
                  clipFilter === key
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <Icon size={13} />
              </button>
            ))}
            {activeFilter && (
              <button
                onClick={() => onClipFilterChange?.(null)}
                title="Clear type filter"
                className="relative z-10 ml-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {showResultCount && (
        <span className="no-drag shrink-0 rounded-full border border-border/60 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {activeFilter?.label ?? 'Results'} · {resultCount}
          {resultHasMore ? '+' : ''}
        </span>
      )}

      {showSearch && hasSearchQuery && (
        <div className="no-drag flex max-w-[180px] items-center gap-1 overflow-hidden">
          <button
            onClick={() => onSearchChange('')}
            title="Clear search text"
            className="flex min-w-0 items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="truncate">"{searchQuery.trim()}"</span>
            <X size={11} className="shrink-0" />
          </button>
        </div>
      )}

      {/* Category Pills (Always visible) */}
      <div
        ref={scrollContainerRef}
        role="tablist"
        aria-label="Clip folders"
        className="no-drag no-scrollbar mask-gradient-right flex min-w-0 flex-1 items-center gap-2 overflow-x-auto p-1"
        onWheel={(e) => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY + e.deltaX;
          }
        }}
      >
        {allCategories.map((cat) => {
          const isActive = selectedFolder === cat.id;

          // Every branch below assigns — no default needed.
          let colorClass: string;

          if (cat.id === null) {
            if (theme === 'light') {
              colorClass = isActive
                ? 'bg-slate-600 text-white ring-1 ring-slate-500/50 font-bold shadow-sm'
                : 'bg-slate-400 text-white hover:bg-slate-500 hover:text-white shadow-sm';
            } else {
              colorClass = isActive
                ? 'bg-indigo-500/20 text-white ring-1 ring-indigo-500/50 font-bold shadow-sm'
                : 'bg-indigo-500/10 text-white/80 hover:bg-indigo-500/20 hover:text-white shadow-sm';
            }
          } else if (cat.id === '__frequent__') {
            colorClass = isActive
              ? theme === 'light'
                ? 'bg-orange-600 text-white ring-2 ring-orange-500/50 font-bold drop-shadow-sm'
                : 'bg-orange-400/30 text-white ring-2 ring-orange-500/50 font-bold drop-shadow-sm'
              : theme === 'light'
                ? 'bg-orange-400 text-white hover:bg-orange-500 hover:text-white drop-shadow-sm'
                : 'bg-orange-400/10 text-white/80 hover:bg-orange-400/20 hover:text-white drop-shadow-sm';
          } else if (cat.id === '__smart__') {
            colorClass = isActive
              ? theme === 'light'
                ? 'bg-violet-600 text-white ring-2 ring-violet-500/50 font-bold drop-shadow-sm'
                : 'bg-violet-400/30 text-white ring-2 ring-violet-500/50 font-bold drop-shadow-sm'
              : theme === 'light'
                ? 'bg-violet-400 text-white hover:bg-violet-500 hover:text-white drop-shadow-sm'
                : 'bg-violet-400/10 text-white/80 hover:bg-violet-400/20 hover:text-white drop-shadow-sm';
          } else {
            const style = getFolderColor(cat.name, cat.color);
            colorClass = isActive ? style.active : style.inactive;
          }

          return (
            <button
              key={cat.id ?? 'all'}
              data-folder-active={isActive ? 'true' : undefined}
              data-folder-id={cat.id ?? undefined}
              onClick={() => {
                // Don't select if we just finished dragging
                if (folderDragRef.current?.started) return;
                onSelectFolder(cat.id);
              }}
              onMouseDown={(e) => {
                if (
                  e.button !== 0 ||
                  !cat.id ||
                  cat.id === '__frequent__' ||
                  cat.id === '__smart__'
                )
                  return;
                folderDragRef.current = { id: cat.id, startX: e.clientX, started: false };
              }}
              onMouseEnter={() => handleMouseEnter(cat.id)}
              onMouseLeave={handleMouseLeave}
              onDragEnter={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                onDragHover(cat.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragLeave={() => onDragLeave()}
              onDrop={(e) => {
                e.preventDefault();
                // Drop is handled by App.tsx finishDrag via dragStateRef
              }}
              onContextMenu={(e) => {
                if (
                  onFolderContextMenu &&
                  cat.id &&
                  cat.id !== '__frequent__' &&
                  cat.id !== '__smart__'
                ) {
                  onFolderContextMenu(e, cat.id);
                }
              }}
              style={{
                textShadow:
                  theme === 'light' ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 2px rgba(0,0,0,0.7)',
                cursor: cat.id ? (folderDragId === cat.id ? 'grabbing' : 'grab') : 'pointer',
              }}
              className={clsx(
                'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                colorClass,
                isDragging &&
                  cat.id === dragTargetFolderId &&
                  'animate-folder-accept z-10 bg-accent shadow-lg shadow-primary/30 ring-2 ring-primary',
                folderDragId === cat.id && 'scale-90 opacity-30',
                // Drop target: highlight with indicator line on the side where item will be inserted
                folderDropTargetId === cat.id &&
                  folderDragId &&
                  (folderDropSide === 'left'
                    ? 'scale-[1.02] border-l-[3px] border-l-white/80'
                    : 'scale-[1.02] border-r-[3px] border-r-white/80')
              )}
            >
              {cat.id === null ? (
                <Layers size={14} className="mr-1 inline-block opacity-80" />
              ) : cat.id === '__frequent__' ? (
                <Flame size={14} className="mr-1 inline-block text-orange-400" />
              ) : cat.id === '__smart__' ? (
                <Sparkles size={14} className="mr-1 inline-block text-violet-400" />
              ) : cat.icon && FOLDER_ICON_MAP[cat.icon] ? (
                (() => {
                  const { Icon: FolderIcon, color } = FOLDER_ICON_MAP[cat.icon];
                  return (
                    <FolderIcon
                      size={14}
                      className={clsx('mr-1 inline-block', color || 'opacity-80')}
                    />
                  );
                })()
              ) : null}
              {cat.name}
              {cat.count !== undefined && cat.count > 0 && (
                <span
                  key={cat.id === null ? `all-${cat.count}` : undefined}
                  className={clsx(
                    'ml-2 text-[10px] opacity-70',
                    cat.id === null && 'transition-all duration-300'
                  )}
                >
                  {cat.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Drag ghost */}
      {folderDragId &&
        (() => {
          const dragFolder = allCategories.find((c) => c.id === folderDragId);
          if (!dragFolder) return null;
          const style = dragFolder.id ? getFolderColor(dragFolder.name, dragFolder.color) : null;
          const colorClass = style ? style.active : 'bg-indigo-500/30 text-white';
          const iconEntry =
            dragFolder.icon && FOLDER_ICON_MAP[dragFolder.icon]
              ? FOLDER_ICON_MAP[dragFolder.icon]
              : null;
          const DragIcon = iconEntry?.Icon || null;
          const dragIconColor = iconEntry?.color || '';
          return (
            <div
              className={clsx(
                'pointer-events-none fixed z-[9999] rounded-lg px-3.5 py-1.5 text-sm font-bold shadow-2xl',
                colorClass,
                'scale-105 opacity-90'
              )}
              style={{
                left: folderDragPos.x,
                top: folderDragPos.y,
                transform: 'translate(-50%, -50%)',
                textShadow: '0 1px 2px rgba(0,0,0,0.7)',
              }}
            >
              {DragIcon && (
                <DragIcon size={14} className={clsx('mr-1 inline-block', dragIconColor)} />
              )}
              {dragFolder.name}
            </div>
          );
        })()}

      {/* Actions */}
      <div
        className="no-drag flex flex-shrink-0 items-center gap-2"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {onToggleScratchpad && (
          <button
            onClick={onToggleScratchpad}
            className={clsx(
              'relative rounded-lg p-2 transition-all duration-200',
              scratchpadFeedback === 'off'
                ? 'bg-red-500/20 text-red-300 shadow-[0_0_16px_rgba(248,113,113,0.22)] ring-1 ring-red-400/40'
                : scratchpadFeedback === 'on' || isScratchpadVisible
                  ? 'bg-amber-500/15 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.16)] ring-1 ring-amber-300/25'
                  : 'text-amber-400/55 hover:bg-amber-500/10 hover:text-amber-300'
            )}
            title={isScratchpadVisible ? 'Hide scratchpad' : 'Show scratchpad'}
            aria-label={isScratchpadVisible ? 'Hide scratchpad' : 'Show scratchpad'}
            aria-pressed={isScratchpadVisible}
          >
            <StickyNote size={18} />
            <span
              className={clsx(
                'absolute right-1 top-1 h-1.5 w-1.5 rounded-full transition-colors',
                scratchpadFeedback === 'off'
                  ? 'bg-red-400'
                  : isScratchpadVisible
                    ? 'bg-emerald-400'
                    : 'bg-muted-foreground/30'
              )}
            />
          </button>
        )}
        {onToggleIncognito && (
          <button
            onClick={onToggleIncognito}
            className={clsx(
              'rounded-lg p-2 transition-colors',
              isIncognito
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'text-muted-foreground/40 hover:bg-accent hover:text-foreground'
            )}
            title={isIncognito ? 'Incognito ON — clipboard not recorded' : 'Enable incognito mode'}
            aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
            aria-pressed={isIncognito}
          >
            <EyeOff size={18} />
          </button>
        )}
        <button
          onClick={onAddClick}
          aria-label="Create new folder"
          className="rounded-lg p-2 text-emerald-400 transition-colors hover:bg-emerald-500/10"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={onMoreClick}
          aria-label="Open settings"
          className="rounded-lg p-2 text-amber-400 transition-colors hover:bg-amber-500/10"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>
    </div>
  );
});

export default ControlBar;
