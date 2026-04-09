import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ClipboardItem as AppClipboardItem, Settings } from '../types';
import { toast } from 'sonner';

interface UseWindowLifecycleOptions {
  searchInputRef: React.RefObject<HTMLInputElement>;
  selectedFolderRef: React.MutableRefObject<string | null>;
  loadClipsRef: React.MutableRefObject<(...args: any[]) => void>;
  debouncedFolderRefreshRef: React.MutableRefObject<() => void>;
  setClips: React.Dispatch<React.SetStateAction<AppClipboardItem[]>>;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedClipIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPreviewFolder: (folder: any) => void;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
}

export function useWindowLifecycle(opts: UseWindowLifecycleOptions) {
  const {
    searchInputRef,
    selectedFolderRef,
    loadClipsRef,
    debouncedFolderRefreshRef,
    setClips,
    setHasMore,
    setIsLoading,
    setSelectedClipId,
    setSelectedClipIds,
    setPreviewFolder,
    setTheme,
  } = opts;

  const [windowFocusCount, setWindowFocusCount] = useState(0);
  const appWindow = getCurrentWindow();

  // Load initial settings + listen for settings-changed
  useEffect(() => {
    invoke<Settings>('get_settings')
      .then((s) => {
        setTheme(s.theme);
      })
      .catch(console.error);

    const unlisten = listen<Settings>('settings-changed', (event) => {
      setTheme(event.payload.theme);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Auto-show search bar when window opens
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);

  // Reset selection, reload clips, and scroll to top every time the window is shown/focused
  // Debounced to avoid spam queries on rapid Alt+Tab toggles
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unlisten = appWindow.listen('tauri://focus', () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        setSelectedClipId(null);
        setSelectedClipIds(new Set());
        // Keep selectedFolder + search — user stays in their context across window toggles
        // Search is only cleared explicitly via Esc key
        setPreviewFolder(undefined);
        setWindowFocusCount((c) => c + 1);
        // Reload clips (respecting current search query if any)
        const currentSearch = searchInputRef.current?.value || '';
        if (!selectedFolderRef.current && !currentSearch) {
          invoke<{ clips: AppClipboardItem[]; folders: any[]; total_count: number }>('get_initial_state', {
            filterId: null,
            limit: 20,
          }).then((state) => {
            setClips(state.clips);
            setHasMore(state.clips.length === 20);
            setIsLoading(false);
            if (state.folders) {
              debouncedFolderRefreshRef.current();
            }
          }).catch(() => {
            loadClipsRef.current(null, false, '');
          });
        } else {
          loadClipsRef.current(selectedFolderRef.current, false, currentSearch);
        }
      }, 150);
    });
    return () => {
      unlisten.then((f) => f());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus search input AFTER React has rendered the cleared state
  useEffect(() => {
    if (windowFocusCount > 0) {
      searchInputRef.current?.focus();
    }
  }, [windowFocusCount]);

  // Subscribe ONCE to clipboard-change — uses refs so the callback is always fresh without re-subscribing
  const refreshCurrentFolderRef = useRef<() => void>(() => {});

  useEffect(() => {
    const unlistenClipboard = listen<{ clip_type?: string }>('clipboard-change', (event) => {
      refreshCurrentFolderRef.current();
      debouncedFolderRefreshRef.current();
      const type = event.payload?.clip_type || 'text';
      toast.success(type === 'image' ? 'Image saved' : 'Clip saved', {
        duration: 1500,
        style: { fontSize: '12px', padding: '6px 12px' },
      });
    });

    return () => {
      unlistenClipboard.then((unlisten) => {
        if (typeof unlisten === 'function') unlisten();
      });
    };
  }, []);

  return {
    windowFocusCount,
    refreshCurrentFolderRef,
  };
}
