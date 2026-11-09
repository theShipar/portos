import { describe, expect, it } from 'vitest';
import { parseUtc } from '@/core/time';
import { buildCatalog, CatalogValidationError } from '@/data/catalog';
import { getSnapshotAt } from '@/engines/snapshot';
import { selectVoyageImpact } from '@/selectors/impact';
import { loadRaw } from './fixtures';

const NOW = parseUtc('2026-11-09T12:00:00Z')!;

describe('missing weather hazard dataset', () => {
  const raw = { ...loadRaw(), weatherHazards: [] };

  it('is fatal when not declared missing (dangling event references)', () => {
    expect(() => buildCatalog(raw)).toThrow(CatalogValidationError);
  });

  it('loads when declared missing and reports it', () => {
    const c = buildCatalog(raw, ['weatherHazards']);
    expect(c.missingDatasets).toEqual(['weatherHazards']);
    expect(c.weatherHazards).toHaveLength(0);
  });

  it('turns route risk into "unknown", never "no hazard"', () => {
    const c = buildCatalog(raw, ['weatherHazards']);
    const snap = getSnapshotAt(c, NOW);
    expect(snap.weatherFeedLoaded).toBe(false);
    const impact = selectVoyageImpact(snap, 'VYG-0001');
    expect(impact.riskStyle.tone).toBe('unknown');
    expect(impact.riskStyle.label).toBe('Route risk unknown');
    expect(impact.riskProvenance.warnings.join(' ')).toMatch(/unknown, not clear/);
  });

  it('keeps ETA and exposure unchanged', () => {
    const full = selectVoyageImpact(getSnapshotAt(buildCatalog(loadRaw()), NOW), 'VYG-0001');
    const partial = selectVoyageImpact(getSnapshotAt(buildCatalog(raw, ['weatherHazards']), NOW), 'VYG-0001');
    expect(partial.shiftText).toBe(full.shiftText);
    expect(partial.exposureText).toBe('$24,000');
  });
});
