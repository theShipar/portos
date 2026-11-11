export const STORAGE_KEYS = {
  preferences: 'portos:preferences:v1',
  workflow: 'portos:workflow:v2',
  /** Read once for migration to v2, then removed (D-037). */
  legacyWorkflow: 'portos:workflow:v1',
  view: 'portos:view:v1',
  layers: 'portos:layers:v1',
  assumptions: 'portos:assumptions:v1',
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

/** Raw parsed value of a key: undefined when absent, null when unreadable JSON. */
export function readStoredJson(key: StorageKey): unknown {
  const text = storage()?.getItem(key);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable or full; the caller keeps the state in memory. */
export function saveStored(key: StorageKey, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearStored(key: StorageKey): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
