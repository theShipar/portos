export const STORAGE_KEYS = {
  preferences: 'portos:preferences:v1',
  workflow: 'portos:workflow:v1',
  view: 'portos:view:v1',
  layers: 'portos:layers:v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface LoadResult<T> {
  value: T;
  /** Set when stored data existed but failed validation and was discarded. */
  corrupted: boolean;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads a versioned key; invalid JSON or shape resets to the fallback and reports corruption. */
export function loadStored<T>(key: StorageKey, validate: (v: unknown) => v is T, fallback: T): LoadResult<T> {
  const s = storage();
  const text = s?.getItem(key);
  if (!text) return { value: fallback, corrupted: false };
  try {
    const parsed: unknown = JSON.parse(text);
    if (validate(parsed)) return { value: parsed, corrupted: false };
  } catch {
    /* fall through */
  }
  s?.removeItem(key);
  return { value: fallback, corrupted: true };
}

export function saveStored(key: StorageKey, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode: state stays in memory */
  }
}

export function clearStored(key: StorageKey): void {
  storage()?.removeItem(key);
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
