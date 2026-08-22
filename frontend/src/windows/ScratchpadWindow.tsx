import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCurrentWindow, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { currentMonitor } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ScratchpadItem } from '../types';
import { X, Plus, StickyNote, Pin, PinOff, Search, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Toaster, toast } from 'sonner';
import { cmd } from '../commands';
import {
  SortMode,
  ViewMode,
  WindowLayout,
  NOTE_COLORS,
  COLLAPSED_WIDTH,
  COLLAPSED_HEIGHT,
  EXPANDED_WIDTH,
  MODAL_WIDTH,
  MODAL_HEIGHT,
} from './scratchpad/scratchpadShared';
import { useScratchpadTheme } from './scratchpad/useScratchpadTheme';
import { useScratchpadDrag } from './scratchpad/useScratchpadDrag';
import { ScratchpadModal } from './scratchpad/ScratchpadModal';
import { NoteCard } from './scratchpad/NoteCard';

export function ScratchpadWindow() {
  const { t } = useTranslation();
  const [scratchpads, setScratchpads] = useState<ScratchpadItem[]>([]);
  const initialMode = useMemo<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('open') === '1' ? 'list' : 'collapsed';
  }, []);
  const [mode, setModeState] = useState<ViewMode>(initialMode);
  const modeRef = useRef<ViewMode>(initialMode);
  const setMode = useCallback((nextMode: ViewMode) => {
    modeRef.current = nextMode;
    setModeState(nextMode);
  }, []);
  const [pinned, setPinned] = useState(initialMode === 'list');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);

  // Paste state
  const [pastingId, setPastingId] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [isPasting, setIsPasting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Keyboard selection, color filter, sort, sort menu visibility
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResizingRef = useRef(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);

  const hideMainWindow = useCallback(() => {
    WebviewWindow.getByLabel('main')
      .then((win) => win?.hide())
      .catch(() => {});
  }, []);
  const emitScratchpadVisibility = useCallback((visible: boolean) => {
    emit('scratchpad-visibility-changed', { visible }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialMode === 'list') hideMainWindow();
  }, [hideMainWindow, initialMode]);

  // Disable right-click
  useEffect(() => {
    const prevent = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    return () => document.removeEventListener('contextmenu', prevent);
  }, []);

  // Keep refs to values consumed inside the keydown handler — lets us declare the
  // handler once without forward-referencing hooks defined further down.
  const filteredRef = useRef<ScratchpadItem[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const goBackRef = useRef<() => void>(() => {});
  const handleCloseRef = useRef<() => void>(() => {});
  const startPasteRef = useRef<(item: ScratchpadItem) => void>(() => {});
  const startEditRef = useRef<(item: ScratchpadItem) => void>(() => {});
  const handleDeleteRef = useRef<(id: string) => void>(() => {});
  selectedIdRef.current = selectedId;

  // Keyboard handler: ESC, arrows, Enter/E/Del/"/" in list mode.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'paste' || mode === 'edit') {
          goBackRef.current();
        } else if (mode === 'list') {
          if (searchQuery) {
            setSearchQuery('');
          } else {
            handleCloseRef.current();
          }
        }
        return;
      }

      if (mode !== 'list') return;
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === '/' && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (inInput) return;

      const list = filteredRef.current;
      const curSelected = selectedIdRef.current;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (list.length === 0) return;
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const idx = curSelected ? list.findIndex((s) => s.id === curSelected) : -1;
        const next =
          idx < 0
            ? dir === 1
              ? 0
              : list.length - 1
            : Math.max(0, Math.min(list.length - 1, idx + dir));
        setSelectedId(list[next].id);
      } else if (e.key === 'Enter' && curSelected) {
        const item = list.find((s) => s.id === curSelected);
        if (item) startPasteRef.current(item);
      } else if ((e.key === 'e' || e.key === 'E') && curSelected && !e.ctrlKey && !e.metaKey) {
        const item = list.find((s) => s.id === curSelected);
        if (item) startEditRef.current(item);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && curSelected) {
        handleDeleteRef.current(curSelected);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mode, searchQuery]);

  useScratchpadTheme();

  // Load
  const loadScratchpads = useCallback(async () => {
    try {
      setScratchpads(await cmd.getScratchpads());
    } catch (e) {
      console.error('Failed to load scratchpads:', e);
    }
  }, []);
  useEffect(() => {
    loadScratchpads();
  }, [loadScratchpads]);

  // Global hotkey listener — toggle between collapsed and list mode.
  useEffect(() => {
    const unlistenP = listen('scratchpad-toggle', () => {
      const nextMode = modeRef.current === 'collapsed' ? 'list' : 'collapsed';
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      if (nextMode === 'list') {
        setPinned(true);
        hideMainWindow();
        appWindow.setFocus().catch(() => {});
      } else {
        setEditingId(null);
        setPastingId(null);
        setIsPasting(false);
        setSearchQuery('');
        setShowSortMenu(false);
        setPinned(false);
      }
      emitScratchpadVisibility(true);
      setMode(nextMode);
    });
    const unlistenOpenP = listen('scratchpad-open', () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      setEditingId(null);
      setPastingId(null);
      setIsPasting(false);
      setSearchQuery('');
      setShowSortMenu(false);
      setPinned(true);
      emitScratchpadVisibility(true);
      setMode('list');
      hideMainWindow();
      appWindow.setFocus().catch(() => {});
    });
    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
      unlistenOpenP.then((fn) => fn()).catch(() => {});
    };
  }, [appWindow, emitScratchpadVisibility, hideMainWindow, setMode]);

  // Filter by search + color, then sort. Synced into filteredRef for keydown handler.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = scratchpads.filter((s) => {
      if (colorFilter && s.color !== colorFilter) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.content.toLowerCase().includes(q))
        return false;
      return true;
    });
    if (sortMode === 'alpha') {
      list = [...list].sort((a, b) => {
        // Pinned still go first even in sorted modes.
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return (a.title || a.content).localeCompare(b.title || b.content);
      });
    } else if (sortMode === 'recent') {
      list = [...list].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        const ta = a.updated_at || a.created_at;
        const tb = b.updated_at || b.created_at;
        return tb.localeCompare(ta);
      });
    }
    return list;
  }, [scratchpads, searchQuery, colorFilter, sortMode]);
  filteredRef.current = filtered;

  // ── Window positioning ──
  // Resize + reposition the window for the given layout: side panel and the
  // collapsed tab hug the right edge; the centered modal is hidden while it
  // moves, then re-shown and focused.
  const applyLayout = useCallback(
    async (layout: WindowLayout) => {
      isResizingRef.current = true;
      try {
        if (layout === 'center') await appWindow.hide();
        const scale = await appWindow.scaleFactor();
        const monitor = await currentMonitor();
        if (!monitor) return;
        const { width: workW, height: workH } = monitor.size;
        const { x: workX, y: workY } = monitor.position;
        const logicalWidth =
          layout === 'side' ? EXPANDED_WIDTH : layout === 'center' ? MODAL_WIDTH : COLLAPSED_WIDTH;
        const w = Math.round(logicalWidth * scale);
        const h =
          layout === 'side'
            ? Math.round(workH * 0.75)
            : Math.round((layout === 'center' ? MODAL_HEIGHT : COLLAPSED_HEIGHT) * scale);
        await appWindow.setSize(new PhysicalSize(w, h));
        const x = layout === 'center' ? workX + Math.round((workW - w) / 2) : workX + workW - w;
        await appWindow.setPosition(new PhysicalPosition(x, workY + Math.round((workH - h) / 2)));
        if (layout === 'center') {
          await appWindow.show();
          await appWindow.setFocus();
        }
      } catch {
      } finally {
        setTimeout(() => {
          isResizingRef.current = false;
        }, 200);
      }
    },
    [appWindow]
  );

  // Mode changes trigger window position. paste/edit go to centered modal
  // for roomy editing; list/collapsed pin to the side.
  useEffect(() => {
    if (mode === 'collapsed') applyLayout('collapsed');
    else if (mode === 'list') {
      hideMainWindow();
      applyLayout('side');
    } else if (mode === 'paste' || mode === 'edit') applyLayout('center');
  }, [hideMainWindow, mode, applyLayout]);

  useEffect(() => {
    if (mode === 'edit' && titleRef.current) titleRef.current.focus();
  }, [mode, editingId]);
  useEffect(() => {
    if (mode === 'paste' && pasteTextareaRef.current) {
      pasteTextareaRef.current.focus();
      const len = pasteTextareaRef.current.value.length;
      pasteTextareaRef.current.setSelectionRange(len, len);
    }
  }, [mode, pastingId]);

  // ── Hover logic ──
  const cancelCollapse = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isResizingRef.current || mode !== 'collapsed') return;
    cancelCollapse();
    // Snapshot whichever app the user is currently in BEFORE we grab focus — paste later
    // routes Shift+Insert back to that HWND. Fire-and-forget.
    cmd.capturePrevForeground().catch(() => {});
    setMode('list');
  }, [mode, cancelCollapse, setMode]);

  const handleMouseLeave = useCallback(() => {
    if (isResizingRef.current || pinned || mode !== 'list') return;
    cancelCollapse();
    collapseTimerRef.current = setTimeout(() => setMode('collapsed'), 600);
  }, [pinned, mode, cancelCollapse, setMode]);

  const goBack = useCallback(() => {
    setEditingId(null);
    setPastingId(null);
    setIsPasting(false);
    setPinned(true);
    setMode('list');
  }, [setMode]);

  const handleClose = useCallback(() => {
    cancelCollapse();
    setEditingId(null);
    setPastingId(null);
    setIsPasting(false);
    setSelectedId(null);
    setSearchQuery('');
    setShowSortMenu(false);
    setPinned(false);
    setMode('collapsed');
    emitScratchpadVisibility(false);
    appWindow.hide().catch(() => {});
  }, [appWindow, cancelCollapse, emitScratchpadVisibility, setMode]);

  const handlePanelClick = useCallback(() => {
    if (!pinned && mode === 'list') setPinned(true);
  }, [pinned, mode]);

  // ── Edit ──
  const startEdit = useCallback(
    (item: ScratchpadItem) => {
      setPastingId(null);
      setEditingId(item.id);
      setEditTitle(item.title);
      setEditContent(item.content);
      setEditColor(item.color);
      setMode('edit');
    },
    [setMode]
  );

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const t = editTitle.trim(),
      c = editContent.trim();
    if (t || c) {
      await cmd.updateScratchpad({
        id: editingId,
        title: t,
        content: c,
        color: editColor || '',
      });
      setScratchpads((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, title: t, content: c, color: editColor } : s))
      );
    } else {
      await cmd.deleteScratchpad(editingId);
      setScratchpads((prev) => prev.filter((s) => s.id !== editingId));
    }
    setEditingId(null);
    setPinned(true);
    setMode('list');
  }, [editingId, editTitle, editContent, editColor, setMode]);

  // ── Paste ──
  const startPaste = useCallback(
    (item: ScratchpadItem) => {
      setEditingId(null);
      setIsPasting(false);
      setPastingId(item.id);
      setPasteContent(item.title ? `${item.title}\n${item.content}` : item.content);
      setMode('paste');
    },
    [setMode]
  );

  const doPaste = useCallback(async () => {
    if (!pastingId || isPasting) return;
    setIsPasting(true);
    let completed = false;
    try {
      // Backend awaits the full restore→paste chain inline — the invoke only
      // resolves AFTER Shift+Insert has been delivered to the target app, so
      // it's safe to start re-showing the collapsed tab below.
      await cmd.scratchpadPaste(pasteContent);
      completed = true;
    } catch (error) {
      console.error('Scratchpad paste failed:', error);
      try {
        await navigator.clipboard.writeText(pasteContent);
        await appWindow.hide().catch(() => {});
        toast.warning(t('scratchpad.pasteFallback'));
        completed = true;
      } catch (fallbackError) {
        console.error('Scratchpad paste fallback failed:', fallbackError);
        toast.error(t('scratchpad.pasteFailed'));
      }
    } finally {
      setIsPasting(false);
    }
    if (!completed) return;
    setPastingId(null);
    setPinned(false);
    setMode('collapsed');
    // moveToCollapsed repositions the hidden window; show it after a tick.
    setTimeout(() => {
      appWindow
        .show()
        .then(() => emitScratchpadVisibility(true))
        .catch(() => {});
    }, 200);
  }, [pastingId, isPasting, pasteContent, appWindow, emitScratchpadVisibility, setMode, t]);

  // ── CRUD ──
  const handleAdd = useCallback(async () => {
    try {
      const item = await cmd.createScratchpad('', '');
      setScratchpads((prev) => [...prev, item]);
      setEditingId(item.id);
      setEditTitle('');
      setEditContent('');
      setMode('edit');
    } catch (e) {
      console.error(e);
    }
  }, [setMode]);

  const handleDelete = useCallback(
    async (id: string) => {
      const victim = scratchpads.find((s) => s.id === id);
      if (!victim) return;
      try {
        await cmd.deleteScratchpad(id);
        setScratchpads((prev) => prev.filter((s) => s.id !== id));
        if (editingId === id) {
          setEditingId(null);
          setMode('list');
        }
        if (pastingId === id) {
          setPastingId(null);
          setIsPasting(false);
          setMode('list');
        }
        if (selectedId === id) setSelectedId(null);
        // Offer undo for 5s — recreates the note (new uuid/id, same content/title/color).
        toast(
          t('scratchpad.deleted', {
            name: victim.title || victim.content.slice(0, 40) || t('scratchpad.note'),
          }),
          {
            duration: 5000,
            action: {
              label: t('common.undo'),
              onClick: async () => {
                try {
                  const restored = await cmd.createScratchpad(victim.title, victim.content);
                  // Restore color in a second call (create_scratchpad doesn't take color).
                  if (victim.color) {
                    await cmd.updateScratchpad({ id: restored.id, color: victim.color });
                    restored.color = victim.color;
                  }
                  setScratchpads((prev) => [...prev, restored]);
                } catch (e) {
                  console.error('Undo delete failed:', e);
                }
              },
            },
          }
        );
      } catch {}
    },
    [scratchpads, editingId, pastingId, selectedId, setMode, t]
  );

  useEffect(() => {
    goBackRef.current = goBack;
    handleCloseRef.current = handleClose;
    startPasteRef.current = startPaste;
    startEditRef.current = startEdit;
    handleDeleteRef.current = handleDelete;
  }, [goBack, handleClose, startPaste, startEdit, handleDelete]);

  const handleToggleNotePin = useCallback(async (id: string) => {
    try {
      const newVal = await cmd.toggleScratchpadPin(id);
      setScratchpads((prev) => prev.map((s) => (s.id === id ? { ...s, is_pinned: newVal } : s)));
    } catch {}
  }, []);

  const handleCopyText = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  }, []);

  // ── Drag ──
  const {
    isDragOver,
    dragOverIndex,
    dragItemRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleItemDragStart,
    handleItemDragOver,
    handleItemDrop,
    handleItemDragEnd,
  } = useScratchpadDrag({ scratchpads, setScratchpads, setPinned, mode, setMode, panelRef });

  // ═══════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════

  // ── Collapsed ──
  if (mode === 'collapsed') {
    return (
      <div
        className="flex h-full w-full cursor-pointer items-center justify-center rounded-l-lg"
        onMouseEnter={handleMouseEnter}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          background:
            'linear-gradient(180deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.35), hsl(var(--primary) / 0.15))',
          borderLeft: '2px solid hsl(var(--primary) / 0.5)',
          boxShadow: 'inset 1px 0 0 hsl(var(--primary) / 0.25)',
        }}
        title={t('scratchpad.edgeHint')}
      >
        {/* Minimal grip — 3 dots centered vertically, subtle primary tint */}
        <div className="flex flex-col gap-1 opacity-60">
          <span className="block h-0.5 w-0.5 rounded-full bg-primary-foreground/80" />
          <span className="block h-0.5 w-0.5 rounded-full bg-primary-foreground/80" />
          <span className="block h-0.5 w-0.5 rounded-full bg-primary-foreground/80" />
        </div>
      </div>
    );
  }

  // ── Centered modal (paste or edit) — separate window size for roomy editing ──
  if ((mode === 'paste' && pastingId) || (mode === 'edit' && editingId)) {
    const isPaste = mode === 'paste';
    const item = scratchpads.find((s) => s.id === (isPaste ? pastingId : editingId));
    if (!item) {
      goBack();
      return null;
    }

    return (
      <ScratchpadModal
        isPaste={isPaste}
        itemTitle={item.title}
        goBack={goBack}
        pasteTextareaRef={pasteTextareaRef}
        pasteContent={pasteContent}
        setPasteContent={setPasteContent}
        doPaste={doPaste}
        isPasting={isPasting}
        titleRef={titleRef}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        editColor={editColor}
        setEditColor={setEditColor}
        editContent={editContent}
        setEditContent={setEditContent}
        saveEdit={saveEdit}
      />
    );
  }

  // ── List view (side panel) — glassmorphism design ──
  return (
    <div
      ref={panelRef}
      className="relative flex h-full w-full flex-col overflow-hidden text-foreground"
      style={{
        borderRadius: '14px 0 0 14px',
        background: `
          radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.05) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 90%, rgba(59,130,246,0.035) 0%, transparent 50%),
          linear-gradient(180deg, hsl(var(--background)), hsl(var(--background) / 0.97))
        `,
        borderLeft: '1px solid hsl(var(--border) / 0.08)',
        boxShadow:
          'inset 0 1px 0 hsl(var(--border) / 0.06), inset -1px 0 0 hsl(var(--border) / 0.04)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handlePanelClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote size={14} className="text-amber-400 drop-shadow-sm" />
            <span className="text-xs font-bold tracking-wide text-foreground/90">
              {t('scratchpad.title')}
            </span>
            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80">
              {scratchpads.length}
            </span>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSortMenu((v) => !v);
              }}
              className={clsx(
                'rounded-md p-1.5 transition-all',
                sortMode !== 'manual'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground/50 hover:bg-white/[0.08] hover:text-foreground/80'
              )}
              title={t('scratchpad.sortBy', { mode: sortMode })}
            >
              <ArrowUpDown size={13} />
            </button>
            {showSortMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-24 top-7 z-30 w-28 overflow-hidden rounded-md border border-border/30 bg-background/95 py-1 text-xs shadow-xl backdrop-blur-md"
              >
                {(['manual', 'alpha', 'recent'] as SortMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setSortMode(m);
                      setShowSortMenu(false);
                    }}
                    className={clsx(
                      'block w-full px-3 py-1.5 text-left capitalize transition-colors',
                      sortMode === m
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground/80 hover:bg-white/[0.08]'
                    )}
                  >
                    {m === 'alpha'
                      ? 'A–Z'
                      : m === 'recent'
                        ? t('scratchpad.sortRecent')
                        : t('scratchpad.sortManual')}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPinned(!pinned);
              }}
              className={clsx(
                'rounded-md p-1.5 transition-all',
                pinned
                  ? 'bg-amber-400/15 text-amber-400'
                  : 'text-muted-foreground/50 hover:bg-white/[0.08] hover:text-foreground/80'
              )}
              title={t(pinned ? 'common.unpin' : 'scratchpad.pinOpen')}
            >
              {pinned ? <Pin size={13} /> : <PinOff size={13} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
              className="rounded-md p-1.5 text-emerald-400/80 transition-all hover:bg-emerald-400/15 hover:text-emerald-400"
              title={t('scratchpad.newNote')}
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="rounded-md p-1.5 text-muted-foreground/50 transition-all hover:bg-red-400/15 hover:text-red-400"
              title={t('scratchpad.hide')}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Color filter — shown when any notes have a color. Click dot to filter/clear. */}
      {scratchpads.some((s) => s.color) && (
        <div className="flex items-center gap-1 px-3 py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setColorFilter(null);
            }}
            className={clsx(
              'flex h-4 w-4 items-center justify-center rounded-full border',
              !colorFilter
                ? 'border-foreground/50 bg-white/10'
                : 'border-transparent text-muted-foreground/50 hover:bg-white/[0.08]'
            )}
            title={t('scratchpad.allColors')}
          >
            <span className="text-[8px]">{t('common.all')}</span>
          </button>
          {NOTE_COLORS.filter((c) => scratchpads.some((s) => s.color === c.key)).map((c) => (
            <button
              key={c.key}
              onClick={(e) => {
                e.stopPropagation();
                setColorFilter(colorFilter === c.key ? null : c.key);
              }}
              className={clsx(
                'h-4 w-4 rounded-full border-2 transition-all',
                c.dot,
                colorFilter === c.key
                  ? 'scale-110 border-foreground/70'
                  : 'border-transparent hover:scale-110'
              )}
              title={c.key}
            />
          ))}
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1.5 ring-1 ring-white/[0.06] transition-all focus-within:ring-primary/30">
          <Search size={12} className="text-muted-foreground/50" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('scratchpad.searchPlaceholder')}
            className="flex-1 border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-muted-foreground/50 hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-2.5 pb-2">
        {filtered.length === 0 && !isDragOver && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-2xl bg-white/[0.05] p-4">
              <StickyNote size={24} className="text-muted-foreground/40" />
            </div>
            <p className="text-xs text-muted-foreground/60">
              {searchQuery ? t('scratchpad.noMatches') : t('scratchpad.emptyHint')}
            </p>
          </div>
        )}
        {isDragOver && filtered.length === 0 && (
          <div className="m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.05] p-10">
            <span className="text-xs font-medium text-primary/60">
              {t('scratchpad.dropClipHere')}
            </span>
          </div>
        )}

        {filtered.map((item, index) => {
          const prev = index > 0 ? filtered[index - 1] : null;
          return (
            <NoteCard
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              // Render a soft divider when we cross from pinned to unpinned (manual sort only — sorted modes already group correctly).
              showPinnedDivider={!!(prev && prev.is_pinned && !item.is_pinned)}
              isDragTarget={dragOverIndex === index && !!dragItemRef.current}
              copied={copiedId === item.id}
              onSelect={setSelectedId}
              onDragStartItem={handleItemDragStart}
              onDragOverItem={(e) => handleItemDragOver(e, index)}
              onDropItem={() => handleItemDrop(index)}
              onDragEndItem={handleItemDragEnd}
              onPaste={startPaste}
              onEdit={startEdit}
              onTogglePin={handleToggleNotePin}
              onCopy={handleCopyText}
              onDelete={handleDelete}
            />
          );
        })}

        {isDragOver && filtered.length > 0 && (
          <div className="mt-1 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/20 bg-primary/[0.03] p-4">
            <span className="text-[11px] font-medium text-primary/50">
              {t('scratchpad.dropToAdd')}
            </span>
          </div>
        )}
      </div>
      <Toaster
        richColors
        position="bottom-center"
        theme="dark"
        toastOptions={{ style: { fontSize: '12px' } }}
      />
    </div>
  );
}
