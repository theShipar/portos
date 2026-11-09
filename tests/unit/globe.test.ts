import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GeoScopeStack, type Scope, type ScopeStackItem, scopeKey } from '@/core/scope';
import {
  angularDistance,
  CameraTransitionController,
  distanceToFitBounds,
  EARTH_PRESET,
  EARTH_RADIUS,
  interpolatePose,
  regionPreset,
  type CameraPose,
} from '@/map/earth/camera';
import { parseWorld } from '@/map/earth/worldGeo';
import { buildRegionRegistry } from '@/map/regions';
import { catalog } from './fixtures';

const camera = { fov: 38, aspect: 1440 / 836 };

function item(scope: Scope, pose: CameraPose): ScopeStackItem<CameraPose, string> {
  return { key: scopeKey(scope), scope, cameraPose: pose, layers: 'fleet', clockUtc: '2026-11-09T12:00:00Z', selection: null };
}

describe('GeoScopeStack', () => {
  const earth: Scope = { level: 'earth' };
  const sea: Scope = { level: 'region', regionId: 'REG-SEA' };
  const neu: Scope = { level: 'region', regionId: 'REG-NEU' };
  const sin: Scope = { level: 'port', regionId: 'REG-SEA', portId: 'PRT-SIN' };
  const earthPose = { lat: 20, lon: 40, distance: 6.9 };
  const seaPose = { lat: 4, lon: 110, distance: 3.6 };

  it('restores the Earth pose after Earth -> Southeast Asia -> back', () => {
    const s = new GeoScopeStack<CameraPose, string>();
    expect(s.transition(item(earth, earthPose), sea)).toBeNull();
    const back = s.transition(item(sea, seaPose), earth);
    expect(back?.cameraPose).toEqual(earthPose);
    expect(s.trail).toHaveLength(0);
  });

  it('restores each level on the way up from a port', () => {
    const s = new GeoScopeStack<CameraPose, string>();
    s.transition(item(earth, earthPose), sea);
    s.transition(item(sea, seaPose), sin);
    expect(s.trail.map((i) => i.key)).toEqual(['earth', 'region:REG-SEA']);
    expect(s.transition(item(sin, { lat: 1, lon: 104, distance: 2.7 }), sea)?.cameraPose).toEqual(seaPose);
    expect(s.transition(item(sea, seaPose), earth)?.cameraPose).toEqual(earthPose);
  });

  it('jumping straight from a port to Earth returns the Earth state and clears deeper entries', () => {
    const s = new GeoScopeStack<CameraPose, string>();
    s.transition(item(earth, earthPose), sea);
    s.transition(item(sea, seaPose), sin);
    expect(s.transition(item(sin, seaPose), earth)?.cameraPose).toEqual(earthPose);
    expect(s.trail).toHaveLength(0);
  });

  it('sideways moves keep the Earth entry and do not invent a saved pose', () => {
    const s = new GeoScopeStack<CameraPose, string>();
    s.transition(item(earth, earthPose), sea);
    expect(s.transition(item(sea, seaPose), neu)).toBeNull();
    expect(s.transition(item(neu, seaPose), earth)?.cameraPose).toEqual(earthPose);
  });

  it('a no-op transition changes nothing', () => {
    const s = new GeoScopeStack<CameraPose, string>();
    s.transition(item(earth, earthPose), sea);
    expect(s.transition(item(sea, seaPose), sea)).toBeNull();
    expect(s.trail).toHaveLength(1);
  });
});

describe('camera math', () => {
  it('fits larger regions further away and stays outside the globe', () => {
    const small = distanceToFitBounds({ west: 103, south: 0.5, east: 105, north: 2 }, camera);
    const sea = distanceToFitBounds({ west: 92, south: -11, east: 142, north: 22 }, camera);
    const ocean = distanceToFitBounds({ west: 30, south: -45, east: 120, north: 30 }, camera);
    expect(small).toBeGreaterThan(EARTH_RADIUS);
    expect(sea).toBeGreaterThan(small);
    expect(ocean).toBeGreaterThan(sea);
  });

  it('clamps region presets around the dataset hint and centres on the bounds', () => {
    const c = catalog();
    for (const r of c.regions) {
      const p = regionPreset(r.regionId, r.bounds, r.cameraPreset.distance, camera);
      const hinted = (r.cameraPreset.distance / 100) * EARTH_RADIUS;
      expect(p.distance).toBeGreaterThanOrEqual(hinted * 0.75 - 1e-9);
      expect(p.distance).toBeLessThanOrEqual(hinted * 1.35 + 1e-9);
      expect(p.distance).toBeGreaterThan(p.minDistance);
      expect(p.distance).toBeLessThan(p.maxDistance);
    }
  });

  it('interpolates along the great circle across the antimeridian with finite values', () => {
    const from = { lat: -25, lon: 170, distance: 4 };
    const to = { lat: -20, lon: -170, distance: 4 };
    let maxLonJump = 0;
    let prev = from;
    for (let i = 0; i <= 20; i++) {
      const p = interpolatePose(from, to, i / 20);
      for (const v of [p.lat, p.lon, p.distance]) expect(Number.isFinite(v)).toBe(true);
      expect(p.distance).toBeGreaterThanOrEqual(4 - 1e-9);
      maxLonJump = Math.max(maxLonJump, angularDistance(prev, p));
      prev = p;
    }
    expect(maxLonJump).toBeLessThan(0.05);
    const end = interpolatePose(from, to, 1);
    expect(angularDistance(end, to)).toBeLessThan(1e-6);
  });

  it('a new flight cancels the previous one', async () => {
    let pose: CameraPose = { lat: EARTH_PRESET.center.lat, lon: EARTH_PRESET.center.lon, distance: EARTH_PRESET.distance };
    const ctl = new CameraTransitionController(
      () => pose,
      (p) => (pose = p),
    );
    const first = ctl.flyTo({ lat: 0, lon: 100, distance: 3 }, { duration: 5 });
    const second = ctl.flyTo({ lat: 50, lon: 5, distance: 4 }, { duration: 0 });
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(pose).toEqual({ lat: 50, lon: 5, distance: 4 });
    expect(ctl.active).toBe(false);
  });
});

describe('region registry', () => {
  const world = parseWorld(JSON.parse(readFileSync(resolve(__dirname, '../../src/assets/maps/world.earth-render.json'), 'utf-8')));
  const registry = buildRegionRegistry(catalog().regions);

  it('resolves Natural Earth -99 countries to stable ISO3 codes', () => {
    expect(world.byIso3.get('FRA')?.name).toBe('France');
    expect(world.byIso3.get('NOR')?.name).toBe('Norway');
  });

  it('picks countries by point-in-polygon', () => {
    expect(world.countryAt(103.82, 1.35)?.iso3).toBe('SGP');
    expect(world.countryAt(2.35, 48.85)?.iso3).toBe('FRA');
    expect(world.countryAt(-30, 0)).toBeNull();
  });

  it('maps picked points to operational regions', () => {
    expect(registry.regionAt(101.7, 3.1, 'MYS')?.regionId).toBe('REG-SEA');
    expect(registry.regionAt(4.48, 51.92, 'NLD')?.regionId).toBe('REG-NEU');
    expect(registry.regionAt(-150, -60, null)).toBeNull();
  });
});
