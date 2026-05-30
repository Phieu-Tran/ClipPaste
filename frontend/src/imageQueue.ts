/**
 * Simple concurrency-limited queue for image fallback loading.
 * Prevents UI stutter when many images fail to load via asset protocol
 * simultaneously and all request image data at once.
 */

import { cmd } from './commands';

type Task<T> = () => Promise<T>;

const MAX_CONCURRENT = 3;
const IMAGE_DATA_URL_CACHE_MAX_ENTRIES = 180;
const IMAGE_DATA_URL_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const FULL_IMAGE_CACHE_MAX_ENTRIES = 6;

let running = 0;
const queue: Array<{
  task: Task<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}> = [];
const imageDataUrlCache = new Map<string, { src: string; bytes: number; thumbnail: boolean }>();
const imageDataUrlInflight = new Map<string, Promise<string>>();
let imageDataUrlCacheBytes = 0;
let imageDataUrlCacheGeneration = 0;

function flush() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    running++;
    item
      .task()
      .then(item.resolve, item.reject)
      .finally(() => {
        running--;
        flush();
      });
  }
}

export function enqueue<T>(task: Task<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ task, resolve: resolve as (v: unknown) => void, reject });
    flush();
  });
}

function cacheKey(clipId: string, thumbnail: boolean) {
  return `${thumbnail ? 'thumb' : 'full'}:${clipId}`;
}

function estimateDataUrlBytes(src: string) {
  return src.length * 2;
}

function touchCachedImage(key: string) {
  const cached = imageDataUrlCache.get(key);
  if (!cached) return '';
  imageDataUrlCache.delete(key);
  imageDataUrlCache.set(key, cached);
  return cached.src;
}

function trimImageDataUrlCache() {
  // 1) Enforce the full-size cap by evicting only the oldest *full* images, so
  //    opening several full images never wipes the (much more numerous and
  //    cheaper-to-keep) thumbnails. Deleting during Map iteration is safe in JS.
  let fullEntries = 0;
  for (const cached of imageDataUrlCache.values()) {
    if (!cached.thumbnail) fullEntries++;
  }
  if (fullEntries > FULL_IMAGE_CACHE_MAX_ENTRIES) {
    for (const [key, cached] of imageDataUrlCache) {
      if (fullEntries <= FULL_IMAGE_CACHE_MAX_ENTRIES) break;
      if (!cached.thumbnail) {
        imageDataUrlCache.delete(key);
        imageDataUrlCacheBytes -= cached.bytes;
        fullEntries--;
      }
    }
  }

  // 2) Enforce the overall byte / entry caps with plain LRU (oldest first).
  while (
    imageDataUrlCacheBytes > IMAGE_DATA_URL_CACHE_MAX_BYTES ||
    imageDataUrlCache.size > IMAGE_DATA_URL_CACHE_MAX_ENTRIES
  ) {
    const first = imageDataUrlCache.entries().next().value as
      | [string, { src: string; bytes: number; thumbnail: boolean }]
      | undefined;
    if (!first) break;

    const [key, cached] = first;
    imageDataUrlCache.delete(key);
    imageDataUrlCacheBytes -= cached.bytes;
  }
}

function writeCachedImage(key: string, src: string, thumbnail: boolean) {
  const existing = imageDataUrlCache.get(key);
  if (existing) {
    imageDataUrlCacheBytes -= existing.bytes;
    imageDataUrlCache.delete(key);
  }

  const bytes = estimateDataUrlBytes(src);
  imageDataUrlCache.set(key, { src, bytes, thumbnail });
  imageDataUrlCacheBytes += bytes;
  trimImageDataUrlCache();
}

export function readCachedImageDataUrl(clipId: string, thumbnail = true): string {
  return touchCachedImage(cacheKey(clipId, thumbnail));
}

export function loadClipImageDataUrl(clipId: string, thumbnail = true): Promise<string> {
  const key = cacheKey(clipId, thumbnail);
  const cached = touchCachedImage(key);
  if (cached) return Promise.resolve(cached);

  const inflight = imageDataUrlInflight.get(key);
  if (inflight) return inflight;

  const requestGeneration = imageDataUrlCacheGeneration;
  const request = enqueue(() => cmd.getClipImageDataUrl(clipId, thumbnail))
    .then((src) => {
      if (requestGeneration === imageDataUrlCacheGeneration) {
        writeCachedImage(key, src, thumbnail);
      }
      return src;
    })
    .finally(() => {
      imageDataUrlInflight.delete(key);
    });

  imageDataUrlInflight.set(key, request);
  return request;
}

export function evictClipImageDataUrl(clipId: string) {
  imageDataUrlCacheGeneration++;
  for (const thumbnail of [true, false]) {
    const key = cacheKey(clipId, thumbnail);
    const cached = imageDataUrlCache.get(key);
    imageDataUrlInflight.delete(key);
    if (!cached) continue;
    imageDataUrlCache.delete(key);
    imageDataUrlCacheBytes -= cached.bytes;
  }
}

export function clearImageDataUrlCache() {
  imageDataUrlCacheGeneration++;
  imageDataUrlCache.clear();
  imageDataUrlInflight.clear();
  imageDataUrlCacheBytes = 0;
}

export function getImageDataUrlCacheStats() {
  return {
    entries: imageDataUrlCache.size,
    estimatedBytes: Math.max(0, imageDataUrlCacheBytes),
    inflight: imageDataUrlInflight.size,
  };
}
