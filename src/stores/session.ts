import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { User } from '@/core/types';
import { isRecord, loadStored, saveStored, STORAGE_KEYS } from './persist';
import { useCatalogStore } from './catalog';

interface Preferences {
  userId: string;
  reducedMotion: boolean | null;
}

const DEFAULT_PREFS: Preferences = { userId: 'USR-005', reducedMotion: null };
const isPrefs = (v: unknown): v is Preferences => isRecord(v) && typeof v.userId === 'string' && (v.reducedMotion === null || typeof v.reducedMotion === 'boolean');

/** Demo identity only — role switching is a UI guard, not authentication. */
export const useSessionStore = defineStore('session', () => {
  const prefs = ref<Preferences>(loadStored(STORAGE_KEYS.preferences, isPrefs, { ...DEFAULT_PREFS }).value);
  watch(prefs, (v) => saveStored(STORAGE_KEYS.preferences, v), { deep: true });

  const catalog = useCatalogStore();
  const user = computed<User | null>(() => catalog.catalog?.byId.user.get(prefs.value.userId) ?? catalog.catalog?.users[0] ?? null);
  const systemReducedMotion = ref(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = computed(() => prefs.value.reducedMotion ?? systemReducedMotion.value);

  function can(flag: string): boolean {
    return !!user.value?.permissionFlags.includes(flag);
  }

  function switchUser(userId: string) {
    prefs.value.userId = userId;
  }

  return { prefs, user, reducedMotion, can, switchUser };
});
