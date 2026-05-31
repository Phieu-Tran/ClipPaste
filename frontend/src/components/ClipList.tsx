import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';
import { ClipboardItem } from '../types';
import { ClipCard } from './ClipCard';
import { LAYOUT, TOTAL_COLUMN_WIDTH } from '../constants';
import { FolderOpen, SearchX, Settings } from 'lucide-react';

interface ClipListProps {
  clips: ClipboardItem[];
  isLoading: boolean;
  hasMore: boolean;
  selectedClipId: string | null;
  selectedClipIds?: Set<string>;
  onSelectClip: (clipId: string, e?: React.MouseEvent) => void;
  onPaste: (clipId: string) => void;
  onCopy: (clipId: string) => void;
  onPin: (clipId: string) => void;
  // Stable callback refs — avoids re-creating closures per card
  showPin?: boolean;
  onLoadMore: () => void;
  resetScrollKey?: number;
  onNativeDragStart?: (e: React.DragEvent, clip: ClipboardItem) => void;
  onCardContextMenu?: (e: React.MouseEvent, clipId: string) => void;
  isPreviewing?: boolean;
  isSearching?: boolean;
  folderMap?: Record<string, string>;
  selectedFolder?: string | null;
  searchQuery?: string;
  onClearSearch?: () => void;
  onShowAll?: () => void;
  onOpenSettings?: () => void;
  copiedClipId?: string | null;
}

export function ClipList({
  clips,
  isLoading,
  hasMore,
  selectedClipId,
  selectedClipIds,
  onSelectClip,
  onPaste,
  onCopy,
  onPin,
  showPin,
  onLoadMore,
  resetScrollKey,
  onNativeDragStart,
  onCardContextMenu,
  isPreviewing,
  isSearching,
  folderMap,
  selectedFolder,
  searchQuery,
  onClearSearch,
  onShowAll,
  onOpenSettings,
  copiedClipId,
}: ClipListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [staggerKey, setStaggerKey] = useState(0);
  const [edges, setEdges] = useState({ left: false, right: false });
  const prevClipsKeyRef = useRef('');

  // Track scroll position to fade the edges that still have off-screen clips.
  const updateEdges = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const left = scrollLeft > 8;
    const right = scrollLeft + clientWidth < scrollWidth - 8;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Stable callback refs — prevent re-creating inline closures per card on every render
  const onSelectClipRef = useRef(onSelectClip);
  onSelectClipRef.current = onSelectClip;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const onCardContextMenuRef = useRef(onCardContextMenu);
  onCardContextMenuRef.current = onCardContextMenu;
  const onNativeDragStartRef = useRef(onNativeDragStart);
  onNativeDragStartRef.current = onNativeDragStart;

  // Stable callbacks that read from refs — never change identity
  const stableOnSelect = useCallback(
    (clipId: string, e?: React.MouseEvent) => onSelectClipRef.current(clipId, e),
    []
  );
  const stableOnPaste = useCallback((clipId: string) => onPasteRef.current(clipId), []);
  const stableOnCopy = useCallback((clipId: string) => onCopyRef.current(clipId), []);
  const stableOnPin = useCallback((clipId: string) => onPinRef.current(clipId), []);
  const stableOnContextMenu = useCallback(
    (e: React.MouseEvent, clipId: string) => onCardContextMenuRef.current?.(e, clipId),
    []
  );
  const stableOnDragStart = useCallback(
    (e: React.DragEvent, clip: ClipboardItem) => onNativeDragStartRef.current?.(e, clip),
    []
  );

  // Detect when the clip list changes entirely and trigger stagger animation
  const clipsKey = clips
    .slice(0, 5)
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    if (prevClipsKeyRef.current && clipsKey !== prevClipsKeyRef.current) {
      setStaggerKey((k) => k + 1);
    }
    prevClipsKeyRef.current = clipsKey;
  }, [clipsKey]);

  // Multi-select order: map clip id → display index (0-based) among selected clips
  const multiSelectOrder = useMemo(() => {
    if (!selectedClipIds || selectedClipIds.size <= 1) return new Map<string, number>();
    const map = new Map<string, number>();
    let idx = 0;
    for (const clip of clips) {
      if (selectedClipIds.has(clip.id)) {
        map.set(clip.id, idx++);
      }
    }
    return map;
  }, [clips, selectedClipIds]);

  // Virtual list — horizontal
  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => TOTAL_COLUMN_WIDTH,
    horizontal: true,
    overscan: 5,
  });

  // Scroll selected card into view when navigating with arrow keys
  useEffect(() => {
    if (!selectedClipId) return;
    const index = clips.findIndex((c) => c.id === selectedClipId);
    const container = containerRef.current;
    if (index < 0 || !container) return;

    const itemStart = LAYOUT.SIDE_PADDING + index * TOTAL_COLUMN_WIDTH;
    const itemEnd = itemStart + TOTAL_COLUMN_WIDTH;
    const viewportStart = container.scrollLeft;
    const viewportEnd = viewportStart + container.clientWidth;
    const edgeComfort = Math.min(96, Math.max(56, container.clientWidth * 0.08));

    let targetLeft: number | null = null;
    if (itemStart < viewportStart + edgeComfort) {
      targetLeft = itemStart - LAYOUT.SIDE_PADDING;
    } else if (itemEnd > viewportEnd - edgeComfort) {
      targetLeft = itemEnd - container.clientWidth + LAYOUT.SIDE_PADDING;
    }

    if (targetLeft !== null) {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollLeft = Math.max(0, Math.min(targetLeft, maxScroll));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId]);

  // Scroll to start when window reopened or clip list changes (search, folder switch)
  useEffect(() => {
    // RAF ensures DOM has rendered before resetting scroll
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollLeft = 0;
      }
    });
  }, [resetScrollKey, clipsKey]);

  // Infinite scroll — load more when near the end
  const handleScroll = useCallback(() => {
    updateEdges();
    if (!containerRef.current || !hasMore || isLoading) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    if (scrollLeft + clientWidth >= scrollWidth - 300) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore, updateEdges]);

  // Recompute edge fades when the clip set changes or the window resizes.
  useEffect(() => {
    const raf = requestAnimationFrame(updateEdges);
    window.addEventListener('resize', updateEdges);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges, clips.length, staggerKey]);

  // Convert vertical wheel → horizontal scroll. Trackpad horizontal gestures work natively.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    // Only intercept vertical scroll (mouse wheel / trackpad vertical swipe)
    // Let native horizontal trackpad gestures pass through untouched
    if (e.deltaY !== 0 && e.deltaX === 0) {
      e.preventDefault();
      // Mouse wheel: deltaMode=0 with large steps (~100px), needs higher multiplier
      // Trackpad: deltaMode=0 with small steps (~1-30px), needs lower multiplier
      const isLikelyMouse = Math.abs(e.deltaY) >= 50;
      const multiplier = isLikelyMouse ? 2.5 : 0.5;
      containerRef.current.scrollLeft += e.deltaY * multiplier;
    }
  }, []);

  if (isLoading && clips.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading clips...</p>
        </div>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
        {isSearching ? (
          <>
            <h3 className="mb-2 text-lg font-semibold text-gray-400">No results</h3>
            <p className="max-w-xs text-sm text-gray-500">
              No clips found matching your search. Try different keywords or use fewer words.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onClearSearch}
                className="btn btn-secondary text-xs"
                disabled={!onClearSearch}
              >
                <SearchX size={14} className="mr-1.5" />
                Clear Search
              </button>
              {selectedFolder && (
                <button
                  onClick={onShowAll}
                  className="btn btn-secondary text-xs"
                  disabled={!onShowAll}
                >
                  <FolderOpen size={14} className="mr-1.5" />
                  Show All
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-lg font-semibold text-gray-400">No clips yet</h3>
            <p className="max-w-xs text-sm text-gray-500">
              Copy something to your clipboard and it will appear here.
            </p>
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="btn btn-secondary mt-4 text-xs">
                <Settings size={14} className="mr-1.5" />
                Settings
              </button>
            )}
            <div className="mt-4 flex flex-col gap-1.5 text-xs text-gray-500/70">
              <span>
                <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>{' '}
                to paste ·{' '}
                <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>{' '}
                navigate
              </span>
              <span>
                <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">E</kbd>{' '}
                edit ·{' '}
                <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">P</kbd> pin
                ·{' '}
                <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+Del
                </kbd>{' '}
                delete
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Clipboard history"
      aria-orientation="horizontal"
      className={clsx(
        'no-scrollbar flex h-full w-full flex-1 overflow-x-auto overflow-y-hidden transition-opacity duration-150',
        isPreviewing && 'opacity-90',
        edges.left && edges.right
          ? 'fade-x-both'
          : edges.left
            ? 'fade-x-left'
            : edges.right
              ? 'fade-x-right'
              : undefined
      )}
      onScroll={handleScroll}
      onWheel={handleWheel}
      style={{
        scrollPaddingLeft: LAYOUT.SIDE_PADDING,
      }}
    >
      {/* Virtual spacer — the full scrollable width */}
      <div
        key={staggerKey}
        className={clsx('relative h-full', isPreviewing && 'animate-preview-refresh')}
        style={{
          width: virtualizer.getTotalSize() + LAYOUT.SIDE_PADDING * 2,
          minWidth: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem, viewIndex) => {
          const clip = clips[virtualItem.index];
          return (
            <div
              key={clip.id}
              className={clsx(
                'absolute flex items-center',
                isSearching ? undefined : 'animate-stagger-in'
              )}
              style={{
                top: 0,
                left: virtualItem.start + LAYOUT.SIDE_PADDING,
                width: virtualItem.size,
                height: '100%',
                ...(isSearching ? {} : { animationDelay: `${viewIndex * 30}ms` }),
              }}
              data-stagger-key={staggerKey}
            >
              <ClipCard
                clip={clip}
                isSelected={selectedClipId === clip.id}
                displayIndex={virtualItem.index + 1}
                isMultiSelected={selectedClipIds?.has(clip.id) ?? false}
                multiSelectIndex={
                  selectedClipIds?.has(clip.id) ? multiSelectOrder.get(clip.id) : undefined
                }
                onSelect={(e) => stableOnSelect(clip.id, e)}
                onPaste={() => stableOnPaste(clip.id)}
                onCopy={() => stableOnCopy(clip.id)}
                onPin={() => stableOnPin(clip.id)}
                showPin={showPin}
                folderName={
                  isSearching && folderMap && selectedFolder
                    ? clip.folder_id !== selectedFolder
                      ? clip.folder_id
                        ? folderMap[clip.folder_id]
                        : 'All'
                      : null
                    : isSearching && folderMap && !selectedFolder && clip.folder_id
                      ? folderMap[clip.folder_id]
                      : null
                }
                onNativeDragStart={stableOnDragStart}
                onContextMenu={(e: React.MouseEvent) => stableOnContextMenu(e, clip.id)}
                searchQuery={searchQuery}
                isCopied={copiedClipId === clip.id}
              />
            </div>
          );
        })}
      </div>

      {/* Loading indicator at the end */}
      {isLoading && clips.length > 0 && (
        <div className="flex h-full min-w-[100px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      )}
    </div>
  );
}
