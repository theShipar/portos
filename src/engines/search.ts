import { PLACES } from '@/core/places';
import type { GeoPoint } from '@/core/types';
import type { Catalog } from '@/data/catalog';

export type SearchKind = 'vessel' | 'port' | 'voyage' | 'incident' | 'region' | 'route' | 'place';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  matchReason: string;
  status?: string;
  location?: GeoPoint;
  score: number;
}

interface IndexEntry {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  location?: GeoPoint;
  fields: { label: string; norm: string; tokens: string[] }[];
}

export interface SearchIndex {
  entries: IndexEntry[];
}

/** Case, whitespace, punctuation and diacritic-insensitive normalisation. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function field(label: string, value: string) {
  const norm = normalize(value);
  return { label, norm, tokens: norm.split(' ').filter(Boolean) };
}

const KIND_ORDER: Record<SearchKind, number> = { port: 0, place: 1, vessel: 2, incident: 3, voyage: 4, region: 5, route: 6 };

export function buildSearchIndex(c: Catalog): SearchIndex {
  const entries: IndexEntry[] = [];
  const portName = (id: string) => c.byId.port.get(id)?.name ?? id;
  for (const p of c.ports) {
    entries.push({
      kind: 'port',
      id: p.portId,
      title: p.name === 'Singapore' ? 'Port of Singapore' : p.name,
      subtitle: `${p.countryIso2} · ${c.byId.region.get(p.regionId)?.name ?? p.regionId}`,
      location: p.location,
      fields: [field('name', p.name), field('id', p.portId), field('country', p.countryIso2)],
    });
  }
  for (const pl of PLACES) {
    entries.push({
      kind: 'place',
      id: pl.placeId,
      title: pl.name,
      subtitle: `${pl.kind === 'canal' ? 'Canal' : 'Strait'} · ${c.byId.region.get(pl.regionId)?.name ?? ''}`,
      location: pl.location,
      fields: [field('name', pl.name)],
    });
  }
  for (const v of c.vessels) {
    entries.push({
      kind: 'vessel',
      id: v.vesselId,
      title: v.name,
      subtitle: `${v.vesselType} · ${v.vesselId}`,
      status: v.navStatus,
      location: v.lastKnownPosition,
      fields: [field('name', v.name), field('id', v.vesselId), field('IMO demo', v.imoDemo)],
    });
  }
  for (const vo of c.voyages) {
    const o = portName(vo.originPortId);
    const d = portName(vo.destinationPortId);
    entries.push({
      kind: 'voyage',
      id: vo.voyageId,
      title: `${vo.voyageId} · ${o} → ${d}`,
      subtitle: c.byId.vessel.get(vo.vesselId)?.name ?? vo.vesselId,
      status: vo.currentStage,
      fields: [field('id', vo.voyageId), field('origin', o), field('destination', d)],
    });
  }
  for (const i of c.incidents) {
    entries.push({
      kind: 'incident',
      id: i.incidentId,
      title: `${i.incidentId} · ${i.title}`,
      subtitle: `${c.byId.vessel.get(i.vesselId)?.name ?? i.vesselId} · ${i.severity}`,
      status: i.status,
      fields: [field('id', i.incidentId), field('title', i.title), field('category', i.category)],
    });
  }
  for (const r of c.regions) {
    entries.push({ kind: 'region', id: r.regionId, title: r.name, subtitle: `Operational region · ${r.portIds.length} ports`, location: r.center, fields: [field('name', r.name), field('id', r.regionId)] });
  }
  for (const r of c.routes) {
    entries.push({
      kind: 'route',
      id: r.routeId,
      title: r.corridorName,
      subtitle: `${portName(r.originPortId)} → ${portName(r.destinationPortId)}`,
      fields: [field('corridor', r.corridorName), field('id', r.routeId)],
    });
  }
  return { entries };
}

function scoreField(q: string, qTokens: string[], f: IndexEntry['fields'][number]): number {
  if (!q) return 0;
  if (f.norm === q) return f.label === 'id' ? 120 : 100;
  if (f.norm.startsWith(q)) return 80;
  if (qTokens.every((qt) => f.tokens.some((t) => t.startsWith(qt)))) return 60;
  if (f.norm.includes(q)) return 40;
  return 0;
}

/** Deterministic local search over the simulated dataset; capped at `limit` results. */
export function search(index: SearchIndex, query: string, limit = 10): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const qTokens = q.split(' ');
  const scored: SearchResult[] = [];
  for (const e of index.entries) {
    let best = 0;
    let reason = '';
    for (const f of e.fields) {
      const s = scoreField(q, qTokens, f);
      if (s > best) {
        best = s;
        reason = f.label;
      }
    }
    if (best > 0) {
      scored.push({ kind: e.kind, id: e.id, title: e.title, subtitle: e.subtitle, status: e.status, location: e.location, matchReason: `Matched ${reason}`, score: best });
    }
  }
  scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
  // Keep groups balanced: at most 4 per kind before filling remaining slots.
  const perKind = new Map<SearchKind, number>();
  const primary: SearchResult[] = [];
  const overflow: SearchResult[] = [];
  for (const r of scored) {
    const n = perKind.get(r.kind) ?? 0;
    if (n < 4) {
      primary.push(r);
      perKind.set(r.kind, n + 1);
    } else overflow.push(r);
  }
  return [...primary, ...overflow].slice(0, limit);
}
