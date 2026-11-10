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
import { routeForEntity, routeForScope, routeForScopeKeepingSelection, viewModeQuery } from './navigation';
import { isOpsRoute, opsRoute, parseOpsLocation, portScope, sceneRefForScope, scopeFromSceneRef, type OpsLocation } from './opsLocation';

const SELECTION_LABEL: Record<EntityRef['kind'], string> = {
  vessel: 'Vessel',
  voyage: 'Voyage',
  incident: 'Incident',
  route: 'Corridor',
  weather: 'Weather hazard',
  port: 'Port',
  region: 'Region',
};

function selectionExists(c: Catalog, ref: EntityRef): boolean {
  switch (ref.kind) {
    case 'vessel':
      return c.byId.vessel.has(ref.id);
    case 'voyage':
      return c.byId.voyage.has(ref.id);
    case 'incident':
      return c.byId.incident.has(ref.id);
    case 'route':
      return c.byId.route.has(ref.id);
    case 'weather':
      return c.byId.weather.has(ref.id);
    case 'port':
      return c.byId.port.has(ref.id);
    case 'region':
      return c.byId.region.has(ref.id);
  }
}

/** Route → store sync. The URL is the source of truth for scene, selection, time and layers. */
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

  /** Scene for a selection opened without one (`/ops?incident=…`): incidents open at their port, the rest stay put. */
  function autoScope(c: Catalog, sel: EntityRef | null): Scope {
    if (sel?.kind === 'incident') {
      const inc = c.byId.incident.get(sel.id);
      if (inc) return portScope(c, catalog.registry, inc.portId);
    }
    return view.scope;
  }

  function apply(r: RouteLocationNormalizedLoaded) {
    const c = catalog.catalog;
    const reg = catalog.registry;
    if (!c || !reg) return;
    if (r.name === 'not-found') {
      first = false;
      return invalid(`No page at ${r.fullPath}. Showing the global view.`, { level: 'earth' });
    }
    if (!isOpsRoute(r.name)) return;
    const loc = parseOpsLocation(r.name, r.params, r.query);

    applyTime(loc);
    const layers = decodeLayers(loc.layers);
    if (layers) view.setLayers(layers);

    if (loc.selection && !selectionExists(c, loc.selection)) {
      return invalid(`${SELECTION_LABEL[loc.selection.kind]} ${loc.selection.id} is not in the simulated dataset.`, view.scope);
    }
    let scope: Scope | null;
    if (loc.scene) {
      scope = scopeFromSceneRef(c, reg, loc.scene);
      if (!scope) {
        const label = loc.scene.level === 'earth' ? 'Scene' : `${loc.scene.level[0].toUpperCase()}${loc.scene.level.slice(1)} ${loc.scene.id}`;
        return invalid(`${label} is not in the simulated dataset.`, { level: 'earth' });
      }
    } else {
      scope = autoScope(c, loc.selection);
      router.replace(opsRoute(sceneRefForScope(scope), loc.selection, r.query));
    }
    view.setScope(scope);
    view.select(loc.selection);

    const requested = loc.view;
    view.viewMode = requested && supportsViewMode(scope, requested) ? requested : defaultViewMode(scope);
    view.kpiDrill = loc.kpi && (KPI_KEYS as string[]).includes(loc.kpi) ? (loc.kpi as KpiKey) : null;
    view.comparing = loc.panel === 'compare' && loc.selection?.kind === 'voyage';
    if (view.comparing) clock.pause();
    if (loc.panel === 'replay') view.replayOpen = true;
  }

  function applyTime(loc: OpsLocation) {
    const t = loc.time;
    if (t) {
      const requested = parseUtc(t);
      if (!clock.seek(t)) notices.push(`Ignored invalid time "${t}" in link; showing ${formatUtc(clock.timeMs)}.`, 'warning');
      else if (requested !== null && Math.abs(requested - clock.timeMs) >= 1000) {
        notices.push(`${formatUtc(requested)} is outside the replay window; showing ${formatUtc(clock.timeMs)} instead.`, 'warning', { timeoutMs: 8000 });
      }
    } else if (first) clock.reset();
    first = false;
  }

  watch(
    () => [route.fullPath, catalog.status] as const,
    () => apply(route),
    { immediate: true },
  );

  /** Clock → URL: a paused replay time is written to `?time=` (replace, no history entry) so reload and share keep it. */
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  watch(
    () => [clock.timeMs, clock.playing] as const,
    ([, playing]) => {
      clearTimeout(urlTimer);
      if (playing || catalog.status !== 'ready' || !isOpsRoute(route.name)) return;
      urlTimer = setTimeout(() => {
        const want = clock.mode === 'replay' ? clock.iso : undefined;
        const cur = route.query.time;
        if ((typeof cur === 'string' ? cur : undefined) === want) return;
        const query = { ...route.query };
        if (want) query.time = want;
        else delete query.time;
        router.replace({ name: route.name ?? undefined, params: route.params, query });
      }, URL_TIME_DEBOUNCE_MS);
    },
  );
}

const URL_TIME_DEBOUNCE_MS = 300;

/** Navigation helpers that keep replay time and the scene in the URL. */
export function useNavigation() {
  const router = useRouter();
  const view = useViewStore();
  const clock = useClockStore();

  const timeQuery = (): LocationQueryRaw => (clock.mode === 'replay' ? { time: clock.iso } : {});
  /** Selections inside a scope keep the current 3D/2D mode; scope changes fall back to the target's default. */
  const modeQuery = (): LocationQueryRaw => {
    const q = viewModeQuery(view.scope, view.viewMode);
    return q ? { view: q } : {};
  };
  const kpiQuery = (): LocationQueryRaw => (view.kpiDrill ? { kpi: view.kpiDrill } : {});
  const replaceQuery = (edit: (q: LocationQueryRaw) => void) => {
    const cur = router.currentRoute.value;
    const query: LocationQueryRaw = { ...cur.query };
    edit(query);
    return router.replace({ name: cur.name ?? undefined, params: cur.params, query });
  };

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
      return replaceQuery((q) => {
        if (key) q.kpi = key;
        else delete q.kpi;
      });
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
    /** Opens the replay rail; with a voyage, also selects it and records `panel=replay` so the link is shareable. */
    openReplay(voyageId?: string) {
      view.replayOpen = true;
      if (!voyageId) return;
      const cur = router.currentRoute.value;
      return router.push(opsRoute(sceneRefForScope(view.scope), { kind: 'voyage', id: voyageId }, { ...cur.query, panel: 'replay' }));
    },
    /** Hides the rail and returns to Now (simulated), keeping the selection. */
    closeReplay() {
      view.replayOpen = false;
      clock.reset();
      return replaceQuery((q) => {
        delete q.time;
        if (q.panel === 'replay') delete q.panel;
      });
    },
    /** Response comparison for a voyage (`panel=compare`); extra query such as `case` is kept. */
    openCompare(voyageId: string, extra: LocationQueryRaw = {}) {
      const cur = router.currentRoute.value;
      return router.push(opsRoute(sceneRefForScope(view.scope), { kind: 'voyage', id: voyageId }, { ...cur.query, ...extra, panel: 'compare' }));
    },
    closeCompare(voyageId: string) {
      const cur = router.currentRoute.value;
      const query: LocationQueryRaw = { ...cur.query };
      delete query.panel;
      delete query.case;
      return router.push(opsRoute(sceneRefForScope(view.scope), { kind: 'voyage', id: voyageId }, query));
    },
    setViewMode(mode: ViewMode) {
      if (!supportsViewMode(view.scope, mode) || mode === view.viewMode) return;
      return replaceQuery((q) => {
        const v = viewModeQuery(view.scope, mode);
        if (v) q.view = v;
        else delete q.view;
      });
    },
  };
}
