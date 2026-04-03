import { vi } from 'vitest';

export const invoke = vi.fn().mockResolvedValue(null);
export const convertFileSrc = vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`);
