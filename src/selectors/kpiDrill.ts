import { formatDuration, formatUsd } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Kpi } from '@/engines/kpis';
import type { Snapshot } from '@/engines/snapshot';

export interface DrillRow {
  ref: EntityRef;
  title: string;
  subtitle: string;
  value: string;
}

function vesselOf(c: Catalog, r: EntityRef): string | null {
  if (r.kind === 'vessel') return r.id;
  if (r.kind === 'voyage') return c.byId.voyage.get(r.id)?.vesselId ?? null;
  if (r.kind === 'incident') return c.byId.incident.get(r.id)?.vesselId ?? null;
  return null;
}

/** Vessels whose markers stay on the map while a KPI drill is active. */
export function drillVesselIds(c: Catalog, kpi: Kpi): Set<string> {
  const out = new Set<string>();
  for (const m of kpi.members) {
    const v = vesselOf(c, m);
    if (v) out.add(v);
  }
  return out;
}

export function buildDrillRows(c: Catalog, snap: Snapshot, kpi: Kpi, limit = 8): { rows: DrillRow[]; total: number } {
  const port = (id: string) => c.byId.port.get(id)?.name ?? id;
  const rows = kpi.members.slice(0, limit).map((r): DrillRow => {
    if (r.kind === 'voyage') {
      const vo = c.byId.voyage.get(r.id);
      const vessel = vo ? c.byId.vessel.get(vo.vesselId)?.name ?? vo.vesselId : r.id;
      const route = vo ? `${port(vo.originPortId)} → ${port(vo.destinationPortId)}` : '';
      let value = formatDuration(snap.etas.get(r.id)?.etaShiftMinutes, { signed: true });
      if (kpi.key === 'exposureUsd') value = formatUsd(snap.exposures.get(r.id)?.estimatedUsd);
      if (kpi.key === 'atRiskVoyages') {
        const risk = snap.risks.get(r.id);
        value = risk?.hazardIds.length ? `Risk ${risk.score}` : 'Incident';
      }
      return { ref: r, title: vessel, subtitle: `${r.id} · ${route}`, value };
    }
    if (r.kind === 'incident') {
      const inc = c.byId.incident.get(r.id);
      return { ref: r, title: inc?.title ?? r.id, subtitle: `${r.id} · ${inc ? c.byId.vessel.get(inc.vesselId)?.name ?? inc.vesselId : ''}`, value: inc?.severity ?? '' };
    }
    const v = c.byId.vessel.get(r.id);
    const s = snap.vessels.get(r.id);
    return { ref: r, title: v?.name ?? r.id, subtitle: `${r.id} · ${v?.vesselType ?? ''}`, value: s?.sogKn === null || s?.sogKn === undefined ? '—' : `${s.sogKn.toFixed(1)} kn` };
  });
  return { rows, total: kpi.members.length };
}
