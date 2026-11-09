import type { IsoUtc } from './types';

/** Strict UTC parse: only ISO 8601 strings ending in `Z` are accepted. Never locale-dependent. */
export function parseUtc(value: IsoUtc | null | undefined): number | null {
  if (!value || typeof value !== 'string' || !value.endsWith('Z')) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function toIsoUtc(ms: number): IsoUtc {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function minutesBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / MINUTE;
}

/** `<input type="datetime-local">` value for a UTC instant (the field is labelled UTC). */
export function toUtcInputValue(ms: number): string {
  return toIsoUtc(ms).slice(0, 16);
}

/** Reads a `datetime-local` value as UTC; empty → null, malformed → undefined. */
export function fromUtcInputValue(value: string): IsoUtc | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value}:00Z`);
  return Number.isFinite(ms) ? toIsoUtc(ms) : undefined;
}
