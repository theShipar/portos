import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { DEFAULT_LAYERS, LAYERS, type LayerId, type ScopeLevel } from '@/core/layers';
import type { EntityKind, EntityRef } from '@/core/types';
import { isRecord, loadStored, saveStored, STORAGE_KEYS } from './persist';

export type Scope = { level: 'earth' } | { level: 'region'; regionId: string } | { level: 'port'; regionId: string; portId: string };

export type InspectorTab = 'overview' | 'voyage' | 'events' | 'documents';
export type ViewMode = '3d' | '2d';

const isLayerState = (v: unknown): v is Record<LayerId, boolean> => isRecord(v) && LAYERS.every((l) => typeof v[l.id] === 'boolean');

export function scopeKey(s: Scope): string {
  return s.level === 'earth' ? 'earth' : s.level === 'region' ? `region:${s.regionId}` : `port:${s.portId}`;
}

export function sameRef(a: EntityRef | null, b: EntityRef | null) {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

export const useViewStore = defineStore('view', () => {
  const stored = loadStored(STORAGE_KEYS.layers, isLayerState, { ...DEFAULT_LAYERS });
  const layers = ref<Record<LayerId, boolean>>(stored.value);
  const storageWarning = ref<string | null>(stored.corrupted ? 'Saved layer preferences were unreadable and have been reset.' : null);

  const scope = ref<Scope>({ level: 'earth' });
  const selection = ref<EntityRef | null>(null);
  const hover = ref<EntityRef | null>(null);
  const inspectorTab = ref<InspectorTab>('overview');
  const inspectorExpanded = ref(false);
  const viewMode = ref<ViewMode>('3d');
  /** Element that opened the inspector, so closing it can return focus. */
  let returnFocusEl: HTMLElement | null = null;

  const level = computed<ScopeLevel>(() => scope.value.level);
  const inspectorOpen = computed(() => selection.value !== null);

  watch(layers, (v) => saveStored(STORAGE_KEYS.layers, v), { deep: true });

  function select(ref: EntityRef | null, opts: { tab?: InspectorTab } = {}) {
    if (ref && !sameRef(ref, selection.value)) {
      returnFocusEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      inspectorTab.value = opts.tab ?? 'overview';
    } else if (opts.tab) inspectorTab.value = opts.tab;
    selection.value = ref;
  }

  function clearSelection() {
    selection.value = null;
    const el = returnFocusEl;
    returnFocusEl = null;
    if (el && document.contains(el)) el.focus();
  }

  function setHover(ref: EntityRef | null) {
    if (!sameRef(ref, hover.value)) hover.value = ref;
  }

  function setScope(s: Scope) {
    if (scopeKey(s) !== scopeKey(scope.value)) scope.value = s;
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
    viewMode.value = '3d';
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
    hover,
    inspectorTab,
    inspectorExpanded,
    inspectorOpen,
    viewMode,
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
