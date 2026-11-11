import { defineStore } from 'pinia';
import { markRaw, shallowRef, ref } from 'vue';
import { loadCargoModule } from '@/data/cargoLoader';
import { buildCargoIndex, type CargoIndex } from '@/engines/cargo';

/** Lazily loaded V3 cargo index (shared by the vessel inspector and, later, the port twins). */
export const useCargoStore = defineStore('cargo', () => {
  const index = shallowRef<CargoIndex | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<string | null>(null);
  let pending: Promise<void> | null = null;

  function ensure(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve();
    if (pending) return pending;
    status.value = 'loading';
    pending = loadCargoModule()
      .then((mod) => {
        index.value = markRaw(buildCargoIndex(mod));
        status.value = 'ready';
      })
      .catch((e: unknown) => {
        error.value = e instanceof Error ? e.message : String(e);
        status.value = 'error';
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { index, status, error, ensure };
});
