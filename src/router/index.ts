import { defineComponent } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { LEGACY_ROUTES, legacyToOps } from './legacyRedirects';

/** Routes carry no views of their own: the map workspace stays mounted and reacts to the route (see routeSync). */
const Outlet = defineComponent({ name: 'RouteOutlet', render: () => null });

export type RouteLevel = 'earth' | 'region' | 'country' | 'city' | 'port' | 'auto';

declare module 'vue-router' {
  interface RouteMeta {
    level: RouteLevel;
  }
}

/**
 * Canonical V2 routes: the path is the scene, the query is everything orthogonal to it
 * (`vessel|voyage|incident|route|hazard`, `panel`, `time`, `speed`, `mode`, `view`, `layers`, `kpi`).
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'ops-earth' } },
  { path: '/ops', name: 'ops-auto', component: Outlet, meta: { level: 'auto' } },
  { path: '/ops/earth', name: 'ops-earth', component: Outlet, meta: { level: 'earth' } },
  { path: '/ops/region/:regionId', name: 'ops-region', component: Outlet, meta: { level: 'region' } },
  { path: '/ops/country/:countryId', name: 'ops-country', component: Outlet, meta: { level: 'country' } },
  { path: '/ops/city/:cityId', name: 'ops-city', component: Outlet, meta: { level: 'city' } },
  { path: '/ops/port/:portId', name: 'ops-port', component: Outlet, meta: { level: 'port' } },
  ...LEGACY_ROUTES.map(
    (r): RouteRecordRaw => ({
      path: r.path,
      name: `legacy-${r.name}`,
      redirect: (to) => legacyToOps(r.name, to.params, to.query),
    }),
  ),
  { path: '/:pathMatch(.*)*', name: 'not-found', component: Outlet, meta: { level: 'earth' } },
];

export function createAppRouter() {
  return createRouter({ history: createWebHistory(), routes });
}
