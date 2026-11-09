import { watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw, type RouteLocationNormalizedLoaded } from 'vue-router';
import { decodeLayers } from '@/core/layers';
import { formatUtc } from '@/core/format';
import { parseUtc } from '@/core/time';
import { defaultViewMode, supportsViewMode, type ViewMode } from '@/core/scope';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { KPI_KEYS, type KpiKey } from '@/engines/kpis';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useViewStore, type Scope } from '@/stores/view';
import { decodeScope, routeForEntity, routeForScope, routeForScopeKeepingSelection, viewModeQuery } from './navigation';

const param = (r: RouteLocationNormalizedLoaded, k: string) => {
  const v = r.params[k];
  return Array.isArray(v) ? v[0] : (v ?? '');
};

function scopeForPort(c: Catalog, portId: string): Scope {
  return { level: 'port', portId, regionId: c.byId.port.get(portId)!.regionId };
}

/** Route → store sync. The URL is the source of truth for selection, scope, time and layers. */
export function useRouteSync() {
  const route = useRoute();
  const router = useRouter();
  const catalog = useCatalogStore();
  const view = useViewStore();
  const clock = useClockStore();
  const notices = useNoticeStore();
  let first = true;

  function invalid(message: string, fallback: Scope) {
    notices.push(message, 'warning', { timeoutMs: 8000 });
    router.replace(routeForScope(fallback));
  }

  function apply(r: RouteLocationNormalizedLoaded) {
    if (!catalog.catalog) return;
    applyRoute(r);
    const q = r.query.view;
    const requested = q === '2d' || q === '3d' ? q : null;
    view.viewMode = requested && supportsViewMode(view.scope, requested) ? requested : defaultViewMode(view.scope);
    const k = r.query.kpi;
    view.kpiDrill = typeof k === 'string' && (KPI_KEYS as string[]).includes(k) ? (k as KpiKey) : null;
    view.comparing = r.name === 'compare';
    if (view.comparing) clock.pause();
    if (r.name === 'replay') view.replayOpen = true;
  }

  function applyRoute(r: RouteLocationNormalizedLoaded) {
    const c = catalog.catalog;
    if (!c) return;

    const t = r.query.t;
    if (typeof t === 'string') {
      const requested = parseUtc(t);
      if (!clock.seek(t)) notices.push(`Ignored invalid time "${t}" in link; showing ${formatUtc(clock.timeMs)}.`, 'warning');
      else if (requested !== null && Math.abs(requested - clock.timeMs) >= 1000) {
        notices.push(`${formatUtc(requested)} is outside the replay window; showing ${formatUtc(clock.timeMs)} instead.`, 'warning', { timeoutMs: 8000 });
      }
    } else if (first) clock.reset();
    first = false;

    const layers = decodeLayers(typeof r.query.layers === 'string' ? r.query.layers : null);
    if (layers) view.setLayers(layers);

    const ctx = decodeScope(c, r.query.in);
    const sel = (ref: EntityRef, fallbackScope: Scope) => {
      view.setScope(ctx ?? (view.scope.level === 'earth' ? fallbackScope : view.scope));
      view.select(ref);
    };

    switch (r.name) {
      case 'operations':
        view.setScope({ level: 'earth' });
        view.select(null);
        return;
      case 'region': {
        const id = param(r, 'regionId');
        if (!c.byId.region.has(id)) return invalid(`Region ${id} is not in the simulated dataset.`, { level: 'earth' });
        view.setScope({ level: 'region', regionId: id });
        view.select(null);
        return;
      }
      case 'port': {
        const id = param(r, 'portId');
        if (!c.byId.port.has(id)) return invalid(`Port ${id} is not in the simulated dataset.`, { level: 'earth' });
        view.setScope(scopeForPort(c, id));
        view.select(null);
        return;
      }
      case 'vessel': {
        const id = param(r, 'vesselId');
        if (!c.byId.vessel.has(id)) return invalid(`Vessel ${id} is not in the simulated dataset.`, ctx ?? view.scope);
        return sel({ kind: 'vessel', id }, { level: 'earth' });
      }
      case 'voyage':
      case 'compare':
      case 'replay': {
        const id = param(r, 'voyageId');
        const vo = c.byId.voyage.get(id);
        if (!vo) return invalid(`Voyage ${id} is not in the simulated dataset.`, ctx ?? view.scope);
        return sel({ kind: 'voyage', id }, { level: 'earth' });
      }
      case 'incident': {
        const id = param(r, 'incidentId');
        const inc = c.byId.incident.get(id);
        if (!inc) return invalid(`Incident ${id} is not in the simulated dataset.`, ctx ?? view.scope);
        return sel({ kind: 'incident', id }, scopeForPort(c, inc.portId));
      }
      case 'route': {
        const id = param(r, 'routeId');
        if (!c.byId.route.has(id)) return invalid(`Corridor ${id} is not in the simulated dataset.`, ctx ?? view.scope);
        return sel({ kind: 'route', id }, { level: 'earth' });
      }
      case 'weather': {
        const id = param(r, 'hazardId');
        if (!c.byId.weather.has(id)) return invalid(`Weather hazard ${id} is not in the simulated dataset.`, ctx ?? view.scope);
        return sel({ kind: 'weather', id }, { level: 'earth' });
      }
      default:
        if (r.name === 'not-found') invalid(`No page at ${r.fullPath}. Showing the global view.`, { level: 'earth' });
    }
  }

  watch(
    () => [route.fullPath, catalog.status] as const,
    () => apply(route),
    { immediate: true },
  );

  /** Clock → URL: a paused replay time is written to `?t=` (replace, no history entry) so reload and share keep it. */
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  watch(
    () => [clock.timeMs, clock.playing] as const,
    ([, playing]) => {
      clearTimeout(urlTimer);
      if (playing || catalog.status !== 'ready') return;
      urlTimer = setTimeout(() => {
        const want = clock.mode === 'replay' ? clock.iso : undefined;
        const cur = route.query.t;
        if ((typeof cur === 'string' ? cur : undefined) === want) return;
        const query = { ...route.query };
        if (want) query.t = want;
        else delete query.t;
        router.replace({ name: route.name ?? undefined, params: route.params, query });
      }, URL_TIME_DEBOUNCE_MS);
    },
  );
}

const URL_TIME_DEBOUNCE_MS = 300;

/** Navigation helpers that keep replay time and scope context in the URL. */
export function useNavigation() {
  const router = useRouter();
  const view = useViewStore();
  const clock = useClockStore();

  const timeQuery = (): LocationQueryRaw => (clock.mode === 'replay' ? { t: clock.iso } : {});
  /** Selections inside a scope keep the current 3D/2D mode; scope changes fall back to the target's default. */
  const modeQuery = (): LocationQueryRaw => {
    const q = viewModeQuery(view.scope, view.viewMode);
    return q ? { view: q } : {};
  };
  const kpiQuery = (): LocationQueryRaw => (view.kpiDrill ? { kpi: view.kpiDrill } : {});

  return {
    openEntity(ref: EntityRef) {
      return router.push(routeForEntity(ref, view.scope, { ...timeQuery(), ...modeQuery(), ...kpiQuery() }));
    },
    /** Scope changes keep the open selection (spec: selection survives Earth ↔ region ↔ port and 3D ↔ 2D). */
    openScope(scope: Scope) {
      return router.push(routeForScopeKeepingSelection(view.selection, scope, { ...timeQuery(), ...(scope.level === 'port' ? {} : kpiQuery()) }));
    },
    /** Filters the map to a KPI's members (or clears the filter); replaces history like the 3D/2D switch. */
    setKpiDrill(key: KpiKey | null) {
      const cur = router.currentRoute.value;
      const query = { ...cur.query };
      if (key) query.kpi = key;
      else delete query.kpi;
      return router.replace({ name: cur.name ?? undefined, params: cur.params, query });
    },
    /** Global view with nothing selected. */
    home() {
      view.clearSelection();
      return router.push(routeForScope({ level: 'earth' }, timeQuery()));
    },
    closeSelection() {
      view.clearSelection();
      return router.push(routeForScope(view.scope, { ...timeQuery(), ...modeQuery(), ...kpiQuery() }));
    },
    /** Opens the replay rail; with a voyage, also moves to its shareable `/replay/:voyageId` link. */
    openReplay(voyageId?: string) {
      view.replayOpen = true;
      if (!voyageId) return;
      const cur = router.currentRoute.value;
      return router.push({ name: 'replay', params: { voyageId }, query: { ...cur.query } });
    },
    /** Hides the rail and returns to Now (simulated), keeping the selection. */
    closeReplay() {
      view.replayOpen = false;
      clock.reset();
      const cur = router.currentRoute.value;
      const query = { ...cur.query };
      delete query.t;
      if (cur.name === 'replay') return router.replace({ name: 'voyage', params: cur.params, query });
      return router.replace({ name: cur.name ?? undefined, params: cur.params, query });
    },
    setViewMode(mode: ViewMode) {
      if (!supportsViewMode(view.scope, mode) || mode === view.viewMode) return;
      const cur = router.currentRoute.value;
      const query = { ...cur.query };
      const q = viewModeQuery(view.scope, mode);
      if (q) query.view = q;
      else delete query.view;
      return router.replace({ name: cur.name ?? undefined, params: cur.params, query });
    },
  };
}
