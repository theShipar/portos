<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatNm, formatUtc, sentenceCase } from '@/core/format';
import type { EntityRef } from '@/core/types';
import { makeProvenance } from '@/engines/provenance';
import { selectVoyageImpact, type VoyageImpact } from '@/selectors/impact';
import type { InspectorField } from '@/selectors/vessel';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import FieldList from '@/components/ui/FieldList.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import VoyageImpactCard from './VoyageImpactCard.vue';

const props = defineProps<{ entity: EntityRef }>();
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();
const router = useRouter();
const route = useRoute();

interface Summary {
  kindLabel: string;
  title: string;
  subtitle: string;
  chips: StatusStyle[];
  impact?: VoyageImpact;
  fields: InspectorField[];
  links: { label: string; ref: EntityRef }[];
  note?: string;
  compareVoyageId?: string;
}

const model = computed<Summary | null>(() => {
  const c = catalog.catalog;
  const s = snap.snapshot;
  if (!c || !s) return null;
  const portName = (id: string) => c.byId.port.get(id)?.name ?? id;
  const { kind, id } = props.entity;
  if (kind === 'voyage') {
    const vo = c.byId.voyage.get(id);
    if (!vo) return null;
    const impact = selectVoyageImpact(s, id);
    return {
      kindLabel: 'Voyage',
      title: `${portName(vo.originPortId)} → ${portName(vo.destinationPortId)}`,
      subtitle: `${vo.voyageId} · ${c.byId.vessel.get(vo.vesselId)?.name ?? vo.vesselId}`,
      chips: [{ tone: 'info', label: sentenceCase(vo.currentStage), icon: 'clock' }, statusStyle('confidence', impact.eta?.confidence ?? 'unknown')],
      impact,
      fields: [
        { label: 'Departure (planned)', value: formatUtc(vo.plannedDepartureUtc), mono: true },
        { label: 'Departure (estimated)', value: formatUtc(vo.departedAtUtc ?? vo.estimatedDepartureUtc), mono: true, hint: vo.departedAtUtc ? 'Actual' : 'Not yet departed' },
        { label: 'Distance remaining', value: formatNm(vo.remainingNmAsOf), mono: true, hint: `Fixture estimate as of ${formatUtc(vo.estimatedAsOfUtc)}` },
        { label: 'Route', value: c.byId.route.get(vo.routeId)?.corridorName ?? vo.routeId },
      ],
      links: [{ label: 'Open vessel', ref: { kind: 'vessel', id: vo.vesselId } }, ...(c.incidentsByVoyage.get(id) ?? []).filter((i) => s.incidents.get(i.incidentId)?.visible).map((i) => ({ label: `Incident ${i.incidentId}`, ref: { kind: 'incident' as const, id: i.incidentId } }))],
      compareVoyageId: vo.voyageId,
    };
  }
  if (kind === 'route') {
    const r = c.byId.route.get(id);
    if (!r) return null;
    return {
      kindLabel: 'Corridor',
      title: r.corridorName,
      subtitle: r.routeId,
      chips: [{ tone: r.isScenarioAlternative ? 'warning' : 'neutral', label: r.isScenarioAlternative ? 'Scenario alternative' : 'Synthetic corridor', icon: 'info' }],
      fields: [
        { label: 'From', value: portName(r.originPortId) },
        { label: 'To', value: portName(r.destinationPortId) },
        { label: 'Distance (est.)', value: formatNm(r.distanceNmEstimate), mono: true },
        { label: 'Waypoints', value: String(r.waypoints.length), mono: true },
        { label: 'Voyages on corridor', value: String(c.voyages.filter((v) => v.routeId === r.routeId).length), mono: true },
      ],
      links: c.weatherHazards
        .filter((h) => h.affectedRouteIds.includes(r.routeId) && s.hazards.get(h.hazardId) === 'active')
        .map((h) => ({ label: `Active hazard ${h.hazardId}`, ref: { kind: 'weather' as const, id: h.hazardId } })),
      note: 'Synthetic corridor for demonstration. Not a navigational route or passage plan.',
    };
  }
  if (kind === 'weather') {
    const h = c.byId.weather.get(id);
    if (!h) return null;
    const phase = s.hazards.get(id) ?? 'not-issued';
    const phaseLabel = { 'not-issued': 'Not yet issued', upcoming: 'Upcoming', active: 'Active', expired: 'Expired' }[phase];
    const affected = [...s.risks.values()].filter((r) => r.hazardIds.includes(id)).sort((a, b) => b.score - a.score || a.voyageId.localeCompare(b.voyageId));
    const affectedProv = makeProvenance({
      sourceClass: 'derived-model',
      evidence: phase === 'active' || phase === 'upcoming' ? 'estimated' : 'unknown',
      method: 'Voyages whose expected traversal enters this polygon while the forecast is valid (geometry × time)',
      feed: 'weather',
      asOf: h.issuedAtUtc,
      nowMs: s.timeMs,
      confidence: h.confidence,
      formula: `${affected.length} intersecting voyages of ${c.voyages.filter((v) => h.affectedRouteIds.includes(v.routeId)).length} on listed corridors`,
      sources: [
        { kind: 'record', id: h.hazardId, label: 'Hazard polygon and validity · weatherHazards.json', atUtc: h.issuedAtUtc },
        { kind: 'engine', id: 'computeRouteHazards', label: 'Route risk engine (30 min traversal steps)' },
      ],
      assumptions: ['A hazard near a corridor without intersection is not counted.', `Fixture bootstrap list names ${h.affectedVoyageIds.length} voyages; shown for validation only.`],
      warnings: phase === 'expired' || phase === 'not-issued' ? ['Forecast not valid at the selected time; no voyages are counted.'] : [],
    });
    return {
      kindLabel: 'Weather hazard',
      title: `${sentenceCase(h.type)} · ${sentenceCase(h.severity)}`,
      subtitle: `${h.hazardId} · Scenario model`,
      chips: [{ tone: phase === 'active' ? (h.severity === 'severe' ? 'critical' : 'warning') : 'unknown', label: phaseLabel, icon: phase === 'active' ? 'alert' : 'clock' }, statusStyle('confidence', h.confidence)],
      fields: [
        { label: 'Issued', value: formatUtc(h.issuedAtUtc), mono: true },
        { label: 'Valid from', value: formatUtc(h.validFromUtc), mono: true },
        { label: 'Valid to', value: formatUtc(h.validToUtc), mono: true },
        { label: 'Affected voyages', value: String(affected.length), mono: true, hint: 'Computed from geometry and time', provenance: affectedProv },
        { label: 'Affected corridors', value: h.affectedRouteIds.map((rid) => c.byId.route.get(rid)?.corridorName ?? rid).join(', ') || 'None listed' },
      ],
      links: [
        ...h.affectedRouteIds.map((rid) => ({ label: `Corridor ${rid}`, ref: { kind: 'route' as const, id: rid } })),
        ...affected.slice(0, 6).map((r) => ({ label: `Voyage ${r.voyageId} · risk ${r.score}`, ref: { kind: 'voyage' as const, id: r.voyageId } })),
      ],
      note:
        phase === 'expired'
          ? 'This forecast had expired at the selected time and is not drawn as current.'
          : phase === 'active'
            ? 'Synthetic scenario forecast. Not for navigation or weather routing decisions.'
            : 'This forecast is not valid yet at the selected time; it is outlined, not filled, on the map.',
    };
  }
  return null;
});
</script>

<template>
  <InspectorDrawer v-if="model" :title="model.title" :kind-label="model.kindLabel" :expanded="view.inspectorExpanded" @update:expanded="view.inspectorExpanded = $event" @close="nav.closeSelection()">
    <template #subtitle>
      <span class="sub mono">{{ model.subtitle }}</span>
      <div class="chips">
        <StatusChip v-for="ch in model.chips" :key="ch.label" :status="ch" dense />
      </div>
    </template>
    <div class="stack">
      <p v-if="model.note" class="note">{{ model.note }}</p>
      <div v-if="model.impact">
        <VoyageImpactCard :impact="model.impact" />
      </div>
      <FieldList :fields="model.fields" />
      <div v-if="model.links.length" class="links">
        <button v-for="l in model.links" :key="l.label" type="button" class="btn btn--sm" @click="nav.openEntity(l.ref)">{{ l.label }}</button>
        <button v-if="model.compareVoyageId" type="button" class="btn btn--sm" data-testid="open-comparison" @click="router.push({ name: 'compare', params: { voyageId: model.compareVoyageId }, query: route.query })">Compare responses</button>
        <button v-if="model.compareVoyageId" type="button" class="btn btn--sm" data-testid="open-replay" @click="nav.openReplay(model.compareVoyageId)">Replay voyage</button>
      </div>
    </div>
  </InspectorDrawer>
</template>

<style scoped>
.sub {
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.stack {
  display: grid;
  gap: var(--space-4);
}
.note {
  padding: 10px 12px;
  border-radius: var(--radius-input);
  background: var(--color-info-subtle);
  color: var(--color-info);
  font-size: var(--text-12);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
