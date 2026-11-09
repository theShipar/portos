import { watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw, type RouteLocationNormalizedLoaded } from 'vue-router';
import { decodeLayers } from '@/core/layers';
import { formatUtc } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useViewStore, type Scope } from '@/stores/view';
import { decodeScope, routeForEntity, routeForScope } from './navigation';

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
    const c = catalog.catalog;
    if (!c) return;

    const t = r.query.t;
    if (typeof t === 'string') {
      if (!clock.seek(t)) notices.push(`Ignored invalid time "${t}" in link; showing ${formatUtc(clock.timeMs)}.`, 'warning');
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
}

/** Navigation helpers that keep replay time and scope context in the URL. */
export function useNavigation() {
  const router = useRouter();
  const view = useViewStore();
  const clock = useClockStore();

  const timeQuery = (): LocationQueryRaw => (clock.mode === 'replay' ? { t: clock.iso } : {});

  return {
    openEntity(ref: EntityRef) {
      return router.push(routeForEntity(ref, view.scope, timeQuery()));
    },
    openScope(scope: Scope) {
      return router.push(routeForScope(scope, timeQuery()));
    },
    closeSelection() {
      view.clearSelection();
      return router.push(routeForScope(view.scope, timeQuery()));
    },
  };
}
