import { ClipboardItem } from './types';

const _cache = new Map<string, string>();

export function cacheIcons(clips: ClipboardItem[]) {
  for (const c of clips) {
    if (c.source_app && c.source_icon && !_cache.has(c.source_app)) {
      _cache.set(c.source_app, c.source_icon);
    }
  }
}

export function getIcon(app: string | null): string | null {
  return app ? (_cache.get(app) ?? null) : null;
}

export function stripIcons(clips: ClipboardItem[]): ClipboardItem[] {
  return clips.map((c) => ({ ...c, source_icon: null }));
}
