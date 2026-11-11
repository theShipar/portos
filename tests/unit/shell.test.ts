import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, decodeLayers, encodeLayers } from '@/core/layers';
import { getSnapshotAt } from '@/engines/snapshot';
import { decodeScope, routeForEntity } from '@/router/navigation';
import { buildVesselInspector } from '@/selectors/vessel';
import tokens from '@/styles/tokens.json';
import v2 from '@/styles/tokens.v2.json';
import { inspectorWidthPx } from '@/styles/layout';
import { V3 } from '@/styles/tokens';
import kitTokens from '../../PORTOS_Codex_Master_Kit/assets/tokens.json';
import { catalog } from './fixtures';

const c = catalog();

describe('design tokens', () => {
  const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf-8').toLowerCase();
  it('app copy equals the kit source of truth', () => {
    expect(tokens).toEqual(kitTokens);
  });
  it('tokens.css carries every colour of the V2 palette (spec 13) and its layout values', () => {
    const hexes = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? (v.startsWith('#') ? [v] : []) : hexes(v as object)));
    const colours = hexes({ surface: v2.surface, text: v2.text, line: v2.line, map: v2.map, accent: v2.accent, state: v2.state, data: v2.data });
    expect(colours.length).toBeGreaterThan(20);
    for (const hex of colours) expect(css).toContain(hex.toLowerCase());
    expect(css).toContain(`--shell-header-h: ${v2.layout.headerPx}px`);
    expect(css).toContain(`--inspector-w: ${v2.layout.inspector}`);
    expect(css).toContain(`--replay-collapsed-h: ${v2.layout.replayCollapsedPx}px`);
    expect(css).toContain(`--replay-expanded-h: ${v2.layout.replayExpandedPx}px`);
    expect(css).toContain(`--radius-panel: ${tokens.radiusPx.panel}px`);
  });
  it('spec 13 core palette values are used verbatim', () => {
    const spec = ['#F6F6F3', '#FFFFFF', '#F0F1EF', '#13191E', '#52606A', '#DCE2E4', '#071A27', '#243A42', '#E66A2D', '#C63B3B', '#B67B17', '#147A66', '#5AADB7', '#7F8B94', '#A6A9B4'];
    for (const hex of spec) expect(css).toContain(hex.toLowerCase());
  });
  it('inspector width follows the active theme (V3 clamp(360px, 29vw, 464px), V2 min(400px, 34vw))', () => {
    if (V3) {
      expect(inspectorWidthPx(1440)).toBe(418);
      expect(inspectorWidthPx(1100)).toBe(360);
    } else {
      expect(inspectorWidthPx(1440)).toBe(400);
      expect(inspectorWidthPx(1100)).toBe(374);
    }
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
    expect(r).toEqual({ name: 'ops-port', params: { portId: 'PRT-SIN' }, query: { vessel: 'VSL-0001', t: '2026-11-09T09:00:00Z' } });
    expect(decodeScope(c, 'port:PRT-SIN')).toEqual({ level: 'port', portId: 'PRT-SIN', regionId: 'REG-SEA', countryId: null, cityId: null });
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
