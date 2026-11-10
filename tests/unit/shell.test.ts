import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, decodeLayers, encodeLayers } from '@/core/layers';
import { getSnapshotAt } from '@/engines/snapshot';
import { decodeScope, routeForEntity } from '@/router/navigation';
import { buildVesselInspector } from '@/selectors/vessel';
import tokens from '@/styles/tokens.json';
import kitTokens from '../../PORTOS_Codex_Master_Kit/assets/tokens.json';
import { catalog } from './fixtures';

const c = catalog();

describe('design tokens', () => {
  const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf-8').toLowerCase();
  it('app copy equals the kit source of truth', () => {
    expect(tokens).toEqual(kitTokens);
  });
  it('tokens.css carries every colour and layout value from tokens.json', () => {
    const colours = [...Object.values(tokens.brand), ...Object.values(tokens.surface), ...Object.values(tokens.ink), ...Object.values(tokens.status)];
    for (const hex of colours) expect(css).toContain(hex.toLowerCase());
    expect(css).toContain(`--shell-header-h: ${tokens.layout.headerPx}px`);
    expect(css).toContain(`--inspector-w: ${tokens.layout.rightInspectorPx}px`);
    expect(css).toContain(`--replay-rail-h: ${tokens.layout.bottomReplayPx}px`);
    expect(css).toContain(`--radius-panel: ${tokens.radiusPx.panel}px`);
  });
});

describe('layers URL encoding', () => {
  it('round-trips and ignores unknown IDs', () => {
    expect(decodeLayers(encodeLayers(DEFAULT_LAYERS))).toEqual(DEFAULT_LAYERS);
    expect(decodeLayers('fleet,bogus')!.fleet).toBe(true);
    expect(decodeLayers('fleet,bogus')!.ports).toBe(false);
    expect(decodeLayers('bogus')).toBeNull();
    expect(decodeLayers(null)).toBeNull();
  });
});

describe('navigation helpers', () => {
  it('keeps scope context for entity routes and rejects unknown scopes', () => {
    const r = routeForEntity({ kind: 'vessel', id: 'VSL-0001' }, { level: 'port', portId: 'PRT-SIN', regionId: 'REG-SEA' }, { t: '2026-11-09T09:00:00Z' });
    expect(r).toMatchObject({ name: 'vessel', params: { vesselId: 'VSL-0001' }, query: { in: 'port:PRT-SIN', t: '2026-11-09T09:00:00Z' } });
    expect(decodeScope(c, 'port:PRT-SIN')).toEqual({ level: 'port', portId: 'PRT-SIN', regionId: 'REG-SEA' });
    expect(decodeScope(c, 'port:NOPE')).toBeNull();
    expect(decodeScope(c, 'region:REG-SEA')).toEqual({ level: 'region', regionId: 'REG-SEA' });
  });
});

describe('vessel inspector model', () => {
  it('presents the Singapore scenario consistently with the engines', () => {
    const m = buildVesselInspector(c, getSnapshotAt(c, c.anchorMs), 'VSL-0001')!;
    expect(m.name).toBe('MV Pacific Horizon');
    expect(m.etaShiftText).toBe('+18.0 h');
    expect(m.exposureText).toBe('$24,000');
    expect(m.activeIncident?.incidentId).toBe('INC-0001');
    expect(m.navStyle.label).toBe('At anchor');
    expect(m.events[0].eventId).toBe('EVT-0009');
  });

  it('hides future incidents and events during replay', () => {
    const m = buildVesselInspector(c, getSnapshotAt(c, Date.parse('2026-11-09T08:00:00Z')), 'VSL-0001')!;
    expect(m.activeIncident).toBeNull();
    expect(m.events.every((e) => e.timeUtc <= '2026-11-09 08:00 UTC')).toBe(true);
    expect(m.etaShiftText).toBe('+8.0 h');
    expect(m.navStyle.label).toBe('At anchor');
  });
});
