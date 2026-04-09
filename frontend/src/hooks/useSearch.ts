import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardItem as AppClipboardItem } from '../types';

const RE_URL = /^https?:\/\/\S+$/i;
const RE_FILE_PATH = /^[a-zA-Z]:\\/;

const CLIP_TYPE_KEYS = new Set(['text', 'image', 'html', 'rtf']);

interface UseSearchOptions {
  clips: AppClipboardItem[];
  previewClips: AppClipboardItem[];
  setPreviewFolder: (folder: any) => void;
}

export function useSearch(opts: UseSearchOptions) {
  const { clips, previewClips, setPreviewFolder } = opts;

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [clipFilter, setClipFilter] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchInput(query);
    setPreviewFolder(undefined);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(query);
    }, 100);
  }, [setPreviewFolder]);

  // Auto-show search bar on mount
  useEffect(() => {
    setShowSearch(true);
  }, []);

  // Unified clip filter — matches by clip_type for base types, by subtype for smart collections
  const matchesClipFilter = useCallback((clip: AppClipboardItem, filter: string): boolean => {
    if (CLIP_TYPE_KEYS.has(filter)) {
      if (filter === 'text') {
        // "text" = pure text, not url/path/file subtypes
        return clip.clip_type === 'text'
          && !RE_URL.test(clip.content.trim())
          && !RE_FILE_PATH.test(clip.content.trim());
      }
      return clip.clip_type === filter;
    }
    // Subtype filter (url, email, color, path, phone, json, code)
    return clip.subtype === filter;
  }, []);

  const filteredClips = useMemo(() => {
    if (!clipFilter) return clips;
    return clips.filter((c) => matchesClipFilter(c, clipFilter));
  }, [clips, clipFilter, matchesClipFilter]);

  const filteredPreviewClips = useMemo(() => {
    if (!clipFilter) return previewClips;
    return previewClips.filter((c) => matchesClipFilter(c, clipFilter));
  }, [previewClips, clipFilter, matchesClipFilter]);

  return {
    searchInput,
    searchQuery,
    showSearch,
    clipFilter,
    filteredClips,
    filteredPreviewClips,
    handleSearch,
    setShowSearch,
    setClipFilter,
  };
}
