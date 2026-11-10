import { describe, expect, it } from 'vitest';
import { scopeFocusId, scopeKey, scopeTrail, supportsViewMode, type Scope } from '@/core/scope';
import { LEGACY_ROUTES, legacyToOps, sceneFromLegacyIn } from '@/router/legacyRedirects';
import { decodeScope, routeForEntity, routeForScope } from '@/router/navigation';
import { opsRoute, parseOpsLocation, portScope, sceneRefForScope, scopeFromSceneRef, type SceneRef } from '@/router/opsLocation';
import { buildSpatialRegistry, CITIES } from '@/spatial/registry';
import { catalog } from './fixtures';

const c = catalog();
const reg = buildSpatialRegistry(c);

describe('spatial registry', () => {
  const byType = (t: string) => [...reg.entries.values()].filter((e) => e.type === t);

  it('covers earth, every region, port-bearing countries, flagship cities and every port', () => {
    expect(byType('earth')).toHaveLength(1);
    expect(byType('region')).toHaveLength(c.regions.length);
    expect(byType('region')).toHaveLength(11);
    expect(byType('city').map((e) => e.id)).toEqual(CITIES.map((x) => x.id));
    expect(byType('port')).toHaveLength(c.ports.length);
    expect(byType('port')).toHaveLength(100);
    expect(byType('country').length).toBeGreaterThanOrEqual(40);
    expect(reg.get('CNT-SGP')).toBeUndefined();
    expect(reg.countryRows.get('CNT-SGP')?.iso3).toBe('SGP');
  });

  it('keeps parent/child links consistent and every trail rooted at earth', () => {
    for (const e of reg.entries.values()) {
      if (e.type === 'earth') continue;
      const parent = reg.get(e.parentId!);
      expect(parent, e.id).toBeDefined();
      expect(parent!.childIds, `${parent!.id} lists ${e.id}`).toContain(e.id);
      expect(reg.trail(e.id)[0].id).toBe('earth');
      expect(reg.trail(e.id).at(-1)!.id).toBe(e.id);
    }
    for (const e of reg.entries.values()) for (const k of e.childIds) expect(reg.get(k), `${e.id} → ${k}`).toBeDefined();
  });

  it('places the flagship ports under their cities', () => {
    expect(reg.trail('PRT-SIN').map((e) => e.id)).toEqual(['earth', 'REG-SEA', 'CTY-SIN', 'PRT-SIN']);
    expect(reg.trail('PRT-RTM').map((e) => e.id)).toEqual(['earth', 'REG-NEU', 'CNT-NLD', 'CTY-RTM', 'PRT-RTM']);
    expect(reg.trail('PRT-GOA').map((e) => e.id)).toEqual(['earth', 'REG-MED', 'CNT-ITA', 'CTY-GOA', 'PRT-GOA']);
    expect(reg.cityOfPort('PRT-SIN')?.id).toBe('CTY-SIN');
    expect(reg.countryOfPort('PRT-SIN')).toBeNull();
    expect(reg.countryOfPort('PRT-RTM')?.id).toBe('CNT-NLD');
  });

  it('declares views per level and flags illustrative regional bounds', () => {
    expect(reg.get('REG-SEA')!.availableViews).toEqual(['region3d', 'earth']);
    expect(reg.get('CNT-NLD')!.availableViews).toEqual(['country3d']);
    expect(reg.get('CTY-SIN')!.availableViews).toEqual(['city3d']);
    expect(reg.get('PRT-SIN')!.availableViews).toEqual(['port3d', 'port2d']);
    expect(reg.get('REG-MED')!.illustrativeBounds).toBe(true);
    expect(reg.get('REG-WAF')!.illustrativeBounds).toBe(true);
    expect(reg.get('REG-SEA')!.illustrativeBounds).toBe(false);
    for (const e of reg.entries.values()) {
      const width = e.bbox.east > e.bbox.west ? e.bbox.east - e.bbox.west : e.bbox.east + 360 - e.bbox.west;
      expect(width, e.id).toBeGreaterThan(0);
      expect(width, e.id).toBeLessThanOrEqual(360);
      expect(e.bbox.south, e.id).toBeLessThan(e.bbox.north);
      expect(e.provenance.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('scope model', () => {
  it('derives focus IDs, keys and breadcrumb trails for every level', () => {
    const port = portScope(c, reg, 'PRT-RTM');
    expect(port).toEqual({ level: 'port', regionId: 'REG-NEU', portId: 'PRT-RTM', countryId: 'CNT-NLD', cityId: 'CTY-RTM' });
    expect(scopeTrail(port).map(scopeFocusId)).toEqual(['earth', 'REG-NEU', 'CNT-NLD', 'CTY-RTM', 'PRT-RTM']);
    expect(scopeKey({ level: 'country', regionId: 'REG-NEU', countryId: 'CNT-NLD' })).toBe('country:CNT-NLD');
    expect(supportsViewMode({ level: 'city', regionId: 'REG-SEA', countryId: null, cityId: 'CTY-SIN' }, '2d')).toBe(false);
    expect(supportsViewMode(port, '2d')).toBe(true);
  });
});

describe('canonical /ops locations', () => {
  const scenes: SceneRef[] = [
    { level: 'earth' },
    { level: 'region', id: 'REG-SEA' },
    { level: 'country', id: 'CNT-NLD' },
    { level: 'city', id: 'CTY-SIN' },
    { level: 'port', id: 'PRT-SIN' },
  ];

  it('round-trips scene, selection, panel and time through the route', () => {
    for (const scene of scenes) {
      const r = opsRoute(scene, { kind: 'voyage', id: 'VOY-0001' }, { panel: 'compare', time: '2026-11-09T09:00:00Z', view: '2d', case: 'INC-0001' }) as {
        name: string;
        params?: Record<string, string>;
        query: Record<string, string>;
      };
      const loc = parseOpsLocation(r.name, r.params ?? {}, r.query);
      expect(loc.scene).toEqual(scene);
      expect(loc.selection).toEqual({ kind: 'voyage', id: 'VOY-0001' });
      expect(loc.panel).toBe('compare');
      expect(loc.time).toBe('2026-11-09T09:00:00Z');
      expect(loc.view).toBe('2d');
      expect(r.query.case).toBe('INC-0001');
    }
  });

  it('maps weather selections to ?hazard= and replaces a stale selection key', () => {
    const r = opsRoute({ level: 'region', id: 'REG-SEA' }, { kind: 'weather', id: 'WX-0001' }, { vessel: 'VSL-0001' }) as { query: Record<string, string> };
    expect(r.query).toEqual({ hazard: 'WX-0001' });
    expect(parseOpsLocation('ops-region', { regionId: 'REG-SEA' }, r.query).selection).toEqual({ kind: 'weather', id: 'WX-0001' });
  });

  it('resolves scene refs against the dataset and rejects unknown or mistyped IDs', () => {
    expect(scopeFromSceneRef(c, reg, { level: 'country', id: 'CNT-NLD' })).toEqual({ level: 'country', regionId: 'REG-NEU', countryId: 'CNT-NLD' });
    expect(scopeFromSceneRef(c, reg, { level: 'city', id: 'CTY-SIN' })).toEqual({ level: 'city', regionId: 'REG-SEA', countryId: null, cityId: 'CTY-SIN' });
    expect(scopeFromSceneRef(c, reg, { level: 'city', id: 'CTY-GOA' })).toEqual({ level: 'city', regionId: 'REG-MED', countryId: 'CNT-ITA', cityId: 'CTY-GOA' });
    expect(scopeFromSceneRef(c, reg, { level: 'port', id: 'PRT-SIN' })).toMatchObject({ level: 'port', portId: 'PRT-SIN', cityId: 'CTY-SIN' });
    expect(scopeFromSceneRef(c, reg, { level: 'country', id: 'REG-SEA' })).toBeNull();
    expect(scopeFromSceneRef(c, reg, { level: 'port', id: 'PRT-NOPE' })).toBeNull();
    for (const s of scenes) {
      const scope = scopeFromSceneRef(c, reg, s)!;
      expect(sceneRefForScope(scope)).toEqual(s);
    }
  });

  it('builds scene routes from scopes and keeps ports and regions as scenes', () => {
    const scope: Scope = { level: 'region', regionId: 'REG-SEA' };
    expect(routeForScope(scope, { time: 'x' })).toEqual({ name: 'ops-region', params: { regionId: 'REG-SEA' }, query: { time: 'x' } });
    expect(routeForEntity({ kind: 'port', id: 'PRT-SIN' }, scope)).toMatchObject({ name: 'ops-port', params: { portId: 'PRT-SIN' } });
    expect(routeForEntity({ kind: 'vessel', id: 'VSL-0047' }, scope)).toMatchObject({ name: 'ops-region', query: { vessel: 'VSL-0047' } });
    expect(decodeScope(c, 'city:CTY-SIN', reg)).toEqual({ level: 'city', regionId: 'REG-SEA', countryId: null, cityId: 'CTY-SIN' });
    expect(decodeScope(c, 'city:CTY-SIN')).toBeNull();
  });
});

describe('legacy redirects', () => {
  const params: Record<string, Record<string, string>> = {
    operations: {},
    region: { regionId: 'REG-SEA' },
    port: { portId: 'PRT-SIN' },
    vessel: { vesselId: 'VSL-0047' },
    voyage: { voyageId: 'VOY-0001' },
    incident: { incidentId: 'INC-0001' },
    route: { routeId: 'RTE-0001' },
    weather: { hazardId: 'WX-0001' },
    compare: { voyageId: 'VOY-0001' },
    replay: { voyageId: 'VOY-0001' },
  };
  const expected: Record<string, { name: string; query: Record<string, string> }> = {
    operations: { name: 'ops-earth', query: {} },
    region: { name: 'ops-region', query: {} },
    port: { name: 'ops-port', query: {} },
    vessel: { name: 'ops-auto', query: { vessel: 'VSL-0047' } },
    voyage: { name: 'ops-auto', query: { voyage: 'VOY-0001' } },
    incident: { name: 'ops-auto', query: { incident: 'INC-0001' } },
    route: { name: 'ops-auto', query: { route: 'RTE-0001' } },
    weather: { name: 'ops-auto', query: { hazard: 'WX-0001' } },
    compare: { name: 'ops-auto', query: { voyage: 'VOY-0001', panel: 'compare' } },
    replay: { name: 'ops-auto', query: { voyage: 'VOY-0001', panel: 'replay' } },
  };

  it('redirects all ten v1 routes to their /ops equivalent', () => {
    expect(LEGACY_ROUTES).toHaveLength(10);
    for (const { name } of LEGACY_ROUTES) {
      const r = legacyToOps(name, params[name], {}) as { name: string; query: Record<string, string> };
      expect(r, name).toMatchObject(expected[name]);
      expect(r.query, name).toEqual(expected[name].query);
    }
  });

  it('renames t to time, turns in= into the scene and passes other keys through', () => {
    const r = legacyToOps('vessel', { vesselId: 'VSL-0047' }, { t: '2026-11-09T09:00:00Z', in: 'port:PRT-SIN', layers: 'fleet', case: 'INC-0001' });
    expect(r).toEqual({
      name: 'ops-port',
      params: { portId: 'PRT-SIN' },
      query: { vessel: 'VSL-0047', time: '2026-11-09T09:00:00Z', layers: 'fleet', case: 'INC-0001' },
    });
    expect(sceneFromLegacyIn('earth')).toEqual({ level: 'earth' });
    expect(sceneFromLegacyIn('bogus:1')).toBeNull();
    expect(sceneFromLegacyIn('region')).toBeNull();
  });
});
