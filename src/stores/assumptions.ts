import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { UserRateOverride } from '@/engines/snapshot';
import { isRecord, loadStored, saveStored, STORAGE_KEYS } from './persist';

interface StoredAssumptions {
  dailyRates: Record<string, UserRateOverride>;
}

/** Upper bound for a what-if daily rate; larger values are rejected as input errors. */
export const MAX_DAILY_RATE_USD = 5_000_000;

const isOverride = (v: unknown): v is UserRateOverride =>
  isRecord(v) && typeof v.usdPerDay === 'number' && Number.isFinite(v.usdPerDay) && v.usdPerDay >= 0 && typeof v.setByUserId === 'string' && typeof v.setAtUtc === 'string';
const isStored = (v: unknown): v is StoredAssumptions => isRecord(v) && isRecord(v.dailyRates) && Object.values(v.dailyRates).every(isOverride);

export function validateDailyRate(input: string): { ok: true; usd: number } | { ok: false; reason: string } {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return { ok: false, reason: 'Enter a daily rate in USD.' };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false, reason: 'Use digits only, e.g. 40000.' };
  if (n < 0) return { ok: false, reason: 'The rate cannot be negative.' };
  if (n > MAX_DAILY_RATE_USD) return { ok: false, reason: `Keep the rate at or below $${MAX_DAILY_RATE_USD.toLocaleString('en-US')}/day.` };
  return { ok: true, usd: Math.round(n) };
}

/** Local what-if assumptions (user scenario). Persisted per browser; never sent anywhere. */
export const useAssumptionStore = defineStore('assumptions', () => {
  const stored = loadStored(STORAGE_KEYS.assumptions, isStored, { dailyRates: {} });
  const dailyRates = ref<Record<string, UserRateOverride>>(stored.value.dailyRates);
  const storageWarning = stored.corrupted ? 'Saved scenario assumptions were unreadable and have been reset to fixture rates.' : null;
  watch(dailyRates, (v) => saveStored(STORAGE_KEYS.assumptions, { dailyRates: v }));

  function setRate(voyageId: string, usdPerDay: number, setByUserId: string, setAtUtc: string) {
    dailyRates.value = { ...dailyRates.value, [voyageId]: { usdPerDay, setByUserId, setAtUtc } };
  }

  function resetRate(voyageId: string) {
    const next = { ...dailyRates.value };
    delete next[voyageId];
    dailyRates.value = next;
  }

  function resetAll() {
    dailyRates.value = {};
  }

  return { dailyRates, storageWarning, setRate, resetRate, resetAll };
});
