import { defineStore } from 'pinia';
import { computed, markRaw } from 'vue';
import { selectKpis, type Kpi } from '@/engines/kpis';
import { getSnapshotAt, type Snapshot, type WorkflowOverlay } from '@/engines/snapshot';
import { deriveWorldSnapshot, eventsBetween, type WorldSnapshot } from '@/engines/world';
import type { TimelineEvent } from '@/core/types';
import { buildVesselMarkers, type VesselMarker } from '@/selectors/mapLayers';
import { drillVesselIds } from '@/selectors/kpiDrill';
import { buildPortViewModel, type PortViewModel } from '@/selectors/port';
import { buildPortTwin, type PortTwinModel } from '@/selectors/portTwin';
import { useAssumptionStore } from './assumptions';
import { useCatalogStore } from './catalog';
import { useClockStore } from './clock';
import { useViewStore } from './view';
import { useWorkflowStore } from './workflow';

/** Derived read models at the committed clock time; the only place UI gets temporal values from. */
export const useSnapshotStore = defineStore('snapshot', () => {
  const catalog = useCatalogStore();
  const clock = useClockStore();
  const view = useViewStore();
  const assumptions = useAssumptionStore();
  const workflow = useWorkflowStore();

  const overlay = computed<WorkflowOverlay>(() => ({ incidents: workflow.overlay, dailyRates: assumptions.dailyRates }));

  /** The world at the committed clock time; every temporal read model below derives from it. */
  const world = computed<WorldSnapshot | null>(() => {
    const c = catalog.catalog;
    if (!c) return null;
    return markRaw(deriveWorldSnapshot(c, clock.timeMs, overlay.value));
  });

  const snapshot = computed<Snapshot | null>(() => world.value?.snapshot ?? null);

  /** Events passed by the latest playback commit (empty after a jump): flashed on the timeline, never skipped. */
  const crossedEvents = computed<TimelineEvent[]>(() => {
    const c = catalog.catalog;
    const span = clock.lastSpan;
    return c && span ? eventsBetween(c, span.fromMs, span.toMs) : [];
  });

  /** Snapshot at Now (simulated), for "compared with now" while replaying. Independent of the clock. */
  const nowSnapshot = computed<Snapshot | null>(() => {
    const c = catalog.catalog;
    if (!c) return null;
    if (clock.phase === 'now' && snapshot.value) return snapshot.value;
    return markRaw(getSnapshotAt(c, c.anchorMs, overlay.value));
  });

  const globalKpis = computed(() => world.value?.kpis ?? []);

  /** KPIs for the visible cohort: the region at region/port scope, the whole simulated fleet at Earth. */
  const kpis = computed<Kpi[]>(() => {
    const c = catalog.catalog;
    if (!c || !snapshot.value) return [];
    const s = view.scope;
    return s.level === 'earth' ? globalKpis.value : selectKpis(c, snapshot.value, { regionId: s.regionId });
  });

  /** Map markers shared by the 3D globe, the 2D port map and the port view model. */
  const markers = computed<VesselMarker[]>(() => (catalog.catalog && snapshot.value ? markRaw(buildVesselMarkers(catalog.catalog, snapshot.value)) : []));

  const portView = computed<PortViewModel | null>(() => {
    const c = catalog.catalog;
    const s = view.scope;
    if (!c || !snapshot.value || s.level !== 'port') return null;
    const vm = buildPortViewModel(c, snapshot.value, s.portId, markers.value);
    return vm ? markRaw(vm) : null;
  });

  const activeDrill = computed<Kpi | null>(() => (view.kpiDrill && view.scope.level !== 'port' ? kpis.value.find((k) => k.key === view.kpiDrill) ?? null : null));

  /** Markers drawn on the map: all, or only the members of the active KPI drill (plus the selection). */
  const mapMarkers = computed<VesselMarker[]>(() => {
    const c = catalog.catalog;
    const drill = activeDrill.value;
    if (!c || !drill) return markers.value;
    const ids = drillVesselIds(c, drill);
    const sel = view.selection;
    const keep = sel?.kind === 'vessel' ? sel.id : null;
    return markRaw(markers.value.filter((m) => ids.has(m.vesselId) || m.vesselId === keep));
  });

  /** Port twin (layout, berth timelines, conflicts) for the port in scope, when it has a layout. */
  const portTwin = computed<PortTwinModel | null>(() => {
    const c = catalog.catalog;
    const s = view.scope;
    if (!c || !snapshot.value || s.level !== 'port') return null;
    const twin = buildPortTwin(c, s.portId, snapshot.value.timeMs);
    return twin ? markRaw(twin) : null;
  });

  return { world, snapshot, crossedEvents, nowSnapshot, globalKpis, kpis, markers, mapMarkers, activeDrill, portView, portTwin };
});
