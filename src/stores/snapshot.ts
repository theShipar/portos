import { defineStore } from 'pinia';
import { computed, markRaw, shallowRef } from 'vue';
import { selectKpis } from '@/engines/kpis';
import { getSnapshotAt, type Snapshot, type WorkflowOverlay } from '@/engines/snapshot';
import { buildVesselMarkers, type VesselMarker } from '@/selectors/mapLayers';
import { buildPortViewModel, type PortViewModel } from '@/selectors/port';
import { useCatalogStore } from './catalog';
import { useClockStore } from './clock';
import { useViewStore } from './view';

/** Derived read models at the committed clock time; the only place UI gets temporal values from. */
export const useSnapshotStore = defineStore('snapshot', () => {
  const catalog = useCatalogStore();
  const clock = useClockStore();
  const view = useViewStore();
  const overlay = shallowRef<WorkflowOverlay | undefined>(undefined);

  const snapshot = computed<Snapshot | null>(() => {
    const c = catalog.catalog;
    if (!c) return null;
    return markRaw(getSnapshotAt(c, clock.timeMs, overlay.value));
  });

  const globalKpis = computed(() => (catalog.catalog && snapshot.value ? selectKpis(catalog.catalog, snapshot.value) : []));

  /** Map markers shared by the 3D globe, the 2D port map and the port view model. */
  const markers = computed<VesselMarker[]>(() => (catalog.catalog && snapshot.value ? markRaw(buildVesselMarkers(catalog.catalog, snapshot.value)) : []));

  const portView = computed<PortViewModel | null>(() => {
    const c = catalog.catalog;
    const s = view.scope;
    if (!c || !snapshot.value || s.level !== 'port') return null;
    const vm = buildPortViewModel(c, snapshot.value, s.portId, markers.value);
    return vm ? markRaw(vm) : null;
  });

  function setOverlay(o: WorkflowOverlay | undefined) {
    overlay.value = o;
  }

  return { snapshot, globalKpis, markers, portView, setOverlay };
});
