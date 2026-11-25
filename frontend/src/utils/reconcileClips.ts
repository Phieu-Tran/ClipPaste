import type { ClipboardItem } from '../types';

function sameClip(a: ClipboardItem, b: ClipboardItem): boolean {
  const keys = Object.keys(b) as (keyof ClipboardItem)[];
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * Merge a freshly fetched clip list into the current one, keeping the existing
 * object for every clip whose fields did not change.
 *
 * Every reload from the backend (window shown, clipboard change, folder switch)
 * returns brand-new objects, and `ClipCard`'s memo compares `clip` by identity,
 * so without this every visible card re-rendered on each reload — right while
 * the window was sliding in. When nothing changed at all, the previous array is
 * returned as-is so React skips the list render entirely.
 */
export function reconcileClips(prev: ClipboardItem[], next: ClipboardItem[]): ClipboardItem[] {
  if (prev === next || prev.length === 0) return next;

  const byId = new Map<string, ClipboardItem>();
  for (const clip of prev) byId.set(clip.id, clip);

  let unchanged = prev.length === next.length;
  const merged = next.map((clip, index) => {
    const existing = byId.get(clip.id);
    const kept = existing && sameClip(existing, clip) ? existing : clip;
    if (unchanged && kept !== prev[index]) unchanged = false;
    return kept;
  });

  return unchanged ? prev : merged;
}
