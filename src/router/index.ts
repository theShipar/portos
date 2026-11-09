import { defineComponent } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

/** Routes carry no views of their own: the map workspace stays mounted and reacts to the route (see routeSync). */
const Outlet = defineComponent({ name: 'RouteOutlet', render: () => null });

export type RouteLevel = 'earth' | 'region' | 'port' | 'vessel' | 'voyage' | 'incident' | 'route' | 'weather' | 'compare' | 'replay';

declare module 'vue-router' {
  interface RouteMeta {
    level: RouteLevel;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'operations' } },
  { path: '/operations', name: 'operations', component: Outlet, meta: { level: 'earth' } },
  { path: '/region/:regionId', name: 'region', component: Outlet, meta: { level: 'region' } },
  { path: '/port/:portId', name: 'port', component: Outlet, meta: { level: 'port' } },
  { path: '/vessel/:vesselId', name: 'vessel', component: Outlet, meta: { level: 'vessel' } },
  { path: '/voyage/:voyageId', name: 'voyage', component: Outlet, meta: { level: 'voyage' } },
  { path: '/incidents/:incidentId', name: 'incident', component: Outlet, meta: { level: 'incident' } },
  { path: '/corridors/:routeId', name: 'route', component: Outlet, meta: { level: 'route' } },
  { path: '/weather/:hazardId', name: 'weather', component: Outlet, meta: { level: 'weather' } },
  { path: '/compare/:voyageId', name: 'compare', component: Outlet, meta: { level: 'compare' } },
  { path: '/replay/:voyageId', name: 'replay', component: Outlet, meta: { level: 'replay' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: Outlet, meta: { level: 'earth' } },
];

export function createAppRouter() {
  return createRouter({ history: createWebHistory(), routes });
}
