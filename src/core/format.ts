import { parseUtc } from './time';

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-09 12:00 UTC` — always explicit UTC. */
export function formatUtc(value: string | number | null | undefined, opts: { seconds?: boolean; date?: boolean } = {}): string {
  const ms = typeof value === 'number' ? value : parseUtc(value ?? null);
  if (ms === null || !Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${opts.seconds ? ':' + pad(d.getUTCSeconds()) : ''}`;
  return opts.date === false ? `${time} UTC` : `${date} ${time} UTC`;
}

/** Local wall-clock time in an IANA zone, labelled `local`. */
export function formatLocal(value: string | number | null | undefined, timeZone: string): string {
  const ms = typeof value === 'number' ? value : parseUtc(value ?? null);
  if (ms === null) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} local`;
}

/** Signed duration from minutes, hours with one decimal when < 48h, e.g. `+18.0 h`, `−45 min`. */
export function formatDuration(minutes: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const sign = opts.signed ? (minutes > 0 ? '+' : minutes < 0 ? '−' : '±') : minutes < 0 ? '−' : '';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${Math.round(abs)} min`;
  const h = abs / 60;
  if (h < 48) return `${sign}${h.toFixed(1)} h`;
  return `${sign}${(h / 24).toFixed(1)} d`;
}

export function formatHours(hours: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  return formatDuration(hours * 60, opts);
}

export function formatNm(nm: number | null | undefined): string {
  if (nm === null || nm === undefined || !Number.isFinite(nm)) return '—';
  return `${Math.round(nm).toLocaleString('en-US')} nm`;
}

export function formatKn(kn: number | null | undefined): string {
  if (kn === null || kn === undefined || !Number.isFinite(kn)) return '—';
  return `${kn.toFixed(1)} kn`;
}

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

export function formatUsd(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return opts.compact && Math.abs(value) >= 100_000 ? usdCompact.format(value) : usdWhole.format(value);
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

export function formatCoord(p: { lat: number; lon: number } | null | undefined, digits = 3): string {
  if (!p) return '—';
  const lat = `${Math.abs(p.lat).toFixed(digits)}°${p.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(p.lon).toFixed(digits)}°${p.lon >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
}

/** Age relative to the simulation clock, e.g. `5 min old`. */
export function formatTimestampFreshness(sourceMs: number | null, nowMs: number): string {
  if (sourceMs === null) return 'age unknown';
  const minutes = Math.round((nowMs - sourceMs) / 60_000);
  if (minutes < 0) return 'future-dated';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min old`;
  const h = minutes / 60;
  return h < 48 ? `${h.toFixed(1)} h old` : `${(h / 24).toFixed(1)} d old`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sentenceCase(s: string): string {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
