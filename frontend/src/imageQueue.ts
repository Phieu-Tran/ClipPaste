/**
 * Simple concurrency-limited queue for image fallback loading.
 * Prevents UI stutter when many images fail to load via asset protocol
 * simultaneously and all trigger invoke('get_clip') at once.
 */

type Task<T> = () => Promise<T>;

const MAX_CONCURRENT = 3;
let running = 0;
const queue: Array<{ task: Task<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

function flush() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    running++;
    item.task().then(item.resolve, item.reject).finally(() => {
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
