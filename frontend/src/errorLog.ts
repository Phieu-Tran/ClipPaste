export type ErrorLogLevel = 'error' | 'warn';

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  level: ErrorLogLevel;
  source: string;
  message: string;
  stack?: string;
}

const STORAGE_KEY = 'clippaste:error-log:v1';
const MAX_ENTRIES = 80;
const subscribers = new Set<() => void>();
let installed = false;

function readStoredEntries(): ErrorLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function writeStoredEntries(entries: ErrorLogEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore storage failures; diagnostics should never destabilize the app.
  }
}

function notifySubscribers() {
  for (const subscriber of subscribers) subscriber();
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function extractStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) return arg.stack;
  }
  return undefined;
}

function appendEntry(entry: Omit<ErrorLogEntry, 'id' | 'timestamp'>) {
  const nextEntry: ErrorLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  writeStoredEntries([nextEntry, ...readStoredEntries()]);
  notifySubscribers();
}

export function logError(source: string, message: string, error?: unknown) {
  appendEntry({
    level: 'error',
    source,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function getErrorLogEntries(): ErrorLogEntry[] {
  return readStoredEntries();
}

export function clearErrorLog() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  notifySubscribers();
}

export function subscribeErrorLog(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function installErrorLogging() {
  if (installed) return;
  installed = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    appendEntry({
      level: 'error',
      source: 'console.error',
      message: args.map(formatArg).join(' '),
      stack: extractStack(args),
    });
    originalError(...args);
  };

  window.addEventListener('error', (event) => {
    appendEntry({
      level: 'error',
      source: 'window.error',
      message: event.message || 'Unhandled window error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    appendEntry({
      level: 'error',
      source: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : formatArg(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
