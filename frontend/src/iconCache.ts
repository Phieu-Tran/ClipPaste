import { ClipboardItem } from './types';

const MAX_ICON_CACHE_ENTRIES = 96;
const MAX_ICON_CACHE_BYTES = 4 * 1024 * 1024;

const _cache = new Map<string, { icon: string; bytes: number }>();
let cacheBytes = 0;

function estimateIconBytes(icon: string) {
  return icon.length * 2;
}

function trimIconCache() {
  while (_cache.size > MAX_ICON_CACHE_ENTRIES || cacheBytes > MAX_ICON_CACHE_BYTES) {
    const first = _cache.entries().next().value as
      | [string, { icon: string; bytes: number }]
      | undefined;
    if (!first) break;
    _cache.delete(first[0]);
    cacheBytes -= first[1].bytes;
  }
}

function setIcon(app: string, icon: string) {
  const existing = _cache.get(app);
  if (existing) {
    cacheBytes -= existing.bytes;
    _cache.delete(app);
  }
  const bytes = estimateIconBytes(icon);
  _cache.set(app, { icon, bytes });
  cacheBytes += bytes;
  trimIconCache();
}

export function cacheIcons(clips: ClipboardItem[]) {
  for (const c of clips) {
    if (c.source_app && c.source_icon && !_cache.has(c.source_app)) {
      setIcon(c.source_app, c.source_icon);
    }
  }
}

export function getIcon(app: string | null): string | null {
  if (!app) return null;
  const cached = _cache.get(app);
  if (!cached) return null;
  _cache.delete(app);
  _cache.set(app, cached);
  return cached.icon;
}

export function stripIcons(clips: ClipboardItem[]): ClipboardItem[] {
  return clips.map((c) => ({ ...c, source_icon: null }));
}
