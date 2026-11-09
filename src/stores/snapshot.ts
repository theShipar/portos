import { defineStore } from 'pinia';
import { computed, markRaw, shallowRef } from 'vue';
import { selectKpis } from '@/engines/kpis';
import { getSnapshotAt, type Snapshot, type WorkflowOverlay } from '@/engines/snapshot';
import { useCatalogStore } from './catalog';
import { useClockStore } from './clock';

/** Derived read models at the committed clock time; the only place UI gets temporal values from. */
export const useSnapshotStore = defineStore('snapshot', () => {
  const catalog = useCatalogStore();
  const clock = useClockStore();
  const overlay = shallowRef<WorkflowOverlay | undefined>(undefined);

  const snapshot = computed<Snapshot | null>(() => {
    const c = catalog.catalog;
    if (!c) return null;
    return markRaw(getSnapshotAt(c, clock.timeMs, overlay.value));
  });

  const globalKpis = computed(() => (catalog.catalog && snapshot.value ? selectKpis(catalog.catalog, snapshot.value) : []));

  function setOverlay(o: WorkflowOverlay | undefined) {
    overlay.value = o;
  }

  return { snapshot, globalKpis, setOverlay };
});
