import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { DEFAULT_LAYERS, LAYERS, type LayerId, type ScopeLevel } from '@/core/layers';
import { scopeKey, type Scope, type ViewMode } from '@/core/scope';
import type { EntityKind, EntityRef } from '@/core/types';
import type { KpiKey } from '@/engines/kpis';
import type { FollowMode } from '@/core/follow';
import { isRecord, loadStored, saveStored, STORAGE_KEYS } from './persist';

export type { Scope } from '@/core/scope';
export { scopeKey } from '@/core/scope';

export type InspectorTab = 'overview' | 'voyage' | 'events' | 'documents';
export type IncidentTab = 'summary' | 'evidence' | 'timeline' | 'actions';
export type { ViewMode } from '@/core/scope';

const isLayerState = (v: unknown): v is Record<LayerId, boolean> => isRecord(v) && LAYERS.every((l) => typeof v[l.id] === 'boolean');

export function sameRef(a: EntityRef | null, b: EntityRef | null) {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

export const useViewStore = defineStore('view', () => {
  const stored = loadStored(STORAGE_KEYS.layers, isLayerState, { ...DEFAULT_LAYERS });
  const layers = ref<Record<LayerId, boolean>>(stored.value);
  const storageWarning = ref<string | null>(stored.corrupted ? 'Saved layer preferences were unreadable and have been reset.' : null);

  const scope = ref<Scope>({ level: 'earth' });
  const selection = ref<EntityRef | null>(null);
  /** Port twin berth in focus (3D twin, 2D port map, berth Gantt); local to the port scope. */
  const berthId = ref<string | null>(null);
  /** V3 typed twin equipment in focus; mirrored from the `equip` URL query. */
  const equipmentId = ref<string | null>(null);
  /** LNG illustrative safety-zone outline on the twin (user toggle). */
  const twinHazard = ref(true);
  /** Height of panels docked along the map's bottom edge (berth schedule); scenes keep their focus above it. */
  const bottomInsetPx = ref(0);
  const hover = ref<EntityRef | null>(null);
  const inspectorTab = ref<InspectorTab>('overview');
  const incidentTab = ref<IncidentTab>('summary');
  const inspectorExpanded = ref(false);
  const viewMode = ref<ViewMode>('3d');
  const queueShelfOpen = ref(true);
  /** Port queue tray showing every waiting call (filters, arrivals); collapsed it lists the three longest waits. */
  const queueTrayOpen = ref(false);
  const incidentQueueOpen = ref(true);
  /** KPI whose members filter the map; mirrored from the `kpi` URL query. */
  const kpiDrill = ref<KpiKey | null>(null);
  /** True on `/compare/:voyageId`; the map then also draws candidate corridors. */
  const comparing = ref(false);
  /** Replay rail visible (also shown whenever the clock is in replay). */
  const replayOpen = ref(false);
  /** Replay timeline height state: collapsed 60 px strip or expanded 116 px with histogram and ranges. */
  const replayExpanded = ref(false);
  /** Below the tablet breakpoint the inspector is a bottom sheet (matches the CSS media query). */
  const sheetQuery = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 1024px)') : null;
  const sheetLayout = ref(sheetQuery?.matches ?? false);
  sheetQuery?.addEventListener('change', (e) => (sheetLayout.value = e.matches));
  /** Follow camera on a vessel (3D scenes). Not persisted; a scope change or a cleared selection ends it. */
  const follow = ref<{ vesselId: string; mode: FollowMode } | null>(null);
  /** Why following is on hold: a manual pan moved away, or the vessel left the scene's bounds. */
  const followHold = ref<'panned' | 'edge' | null>(null);
  /** Element that opened the inspector, so closing it can return focus. */
  let returnFocusEl: HTMLElement | null = null;

  const level = computed<ScopeLevel>(() => scope.value.level);
  const inspectorOpen = computed(() => selection.value !== null);

  watch(layers, (v) => saveStored(STORAGE_KEYS.layers, v), { deep: true });

  function select(ref: EntityRef | null, opts: { tab?: InspectorTab } = {}) {
    if (ref && !sameRef(ref, selection.value)) {
      returnFocusEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      inspectorTab.value = opts.tab ?? 'overview';
      incidentTab.value = 'summary';
    } else if (opts.tab) inspectorTab.value = opts.tab;
    selection.value = ref;
    // Selecting another vessel retargets the follow camera (time and filters stay); clearing ends it.
    if (!follow.value) return;
    if (!ref) stopFollow();
    else if (ref.kind === 'vessel' && ref.id !== follow.value.vesselId) {
      follow.value = { ...follow.value, vesselId: ref.id };
      followHold.value = null;
    }
  }

  function startFollow(vesselId: string, mode?: FollowMode) {
    follow.value = { vesselId, mode: mode ?? follow.value?.mode ?? 'chase' };
    followHold.value = null;
  }

  function setFollowMode(mode: FollowMode) {
    if (follow.value) follow.value = { ...follow.value, mode };
    followHold.value = null;
  }

  function stopFollow() {
    follow.value = null;
    followHold.value = null;
  }

  function resumeFollow() {
    followHold.value = null;
  }

  function clearSelection() {
    selection.value = null;
    stopFollow();
    const el = returnFocusEl;
    returnFocusEl = null;
    if (el && document.contains(el)) el.focus();
  }

  function setHover(ref: EntityRef | null) {
    if (!sameRef(ref, hover.value) && (ref || hover.value)) hover.value = ref;
  }

  function setScope(s: Scope) {
    if (scopeKey(s) === scopeKey(scope.value)) return;
    scope.value = s;
    berthId.value = null;
    equipmentId.value = null;
    stopFollow();
  }

  function selectBerth(id: string | null) {
    berthId.value = id;
  }

  function selectEquipment(id: string | null) {
    equipmentId.value = id;
  }

  function toggleLayer(id: LayerId, on?: boolean) {
    layers.value[id] = on ?? !layers.value[id];
  }

  function setLayers(next: Record<LayerId, boolean>) {
    layers.value = { ...next };
  }

  function resetView() {
    layers.value = { ...DEFAULT_LAYERS };
    scope.value = { level: 'earth' };
    selection.value = null;
    berthId.value = null;
    equipmentId.value = null;
    viewMode.value = '3d';
    kpiDrill.value = null;
    replayOpen.value = false;
    stopFollow();
  }

  function isSelected(kind: EntityKind, id: string) {
    return selection.value?.kind === kind && selection.value.id === id;
  }

  return {
    layers,
    storageWarning,
    scope,
    level,
    selection,
    berthId,
    selectBerth,
    equipmentId,
    selectEquipment,
    twinHazard,
    bottomInsetPx,
    hover,
    inspectorTab,
    incidentTab,
    inspectorExpanded,
    inspectorOpen,
    sheetLayout,
    viewMode,
    queueShelfOpen,
    queueTrayOpen,
    incidentQueueOpen,
    kpiDrill,
    comparing,
    replayOpen,
    replayExpanded,
    follow,
    followHold,
    startFollow,
    setFollowMode,
    stopFollow,
    resumeFollow,
    select,
    clearSelection,
    setHover,
    setScope,
    toggleLayer,
    setLayers,
    resetView,
    isSelected,
  };
});
