<script setup lang="ts">
import { computed } from 'vue';
import { formatDuration, formatNm, formatUsd, formatUtc, sentenceCase } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { InspectorField } from '@/selectors/vessel';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import FieldList from '@/components/ui/FieldList.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = defineProps<{ entity: EntityRef }>();
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();

interface Summary {
  kindLabel: string;
  title: string;
  subtitle: string;
  chips: StatusStyle[];
  fields: InspectorField[];
  links: { label: string; ref: EntityRef }[];
  note?: string;
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
    const eta = s.etas.get(id);
    const ex = s.exposures.get(id);
    return {
      kindLabel: 'Voyage',
      title: `${portName(vo.originPortId)} → ${portName(vo.destinationPortId)}`,
      subtitle: `${vo.voyageId} · ${c.byId.vessel.get(vo.vesselId)?.name ?? vo.vesselId}`,
      chips: [{ tone: 'info', label: sentenceCase(vo.currentStage), icon: 'clock' }, statusStyle('confidence', eta?.confidence ?? 'unknown')],
      fields: [
        { label: 'Planned ETA', value: formatUtc(eta?.plannedArrivalUtc), mono: true },
        { label: 'Forecast ETA', value: formatUtc(eta?.estimatedArrivalUtc), mono: true },
        { label: 'Forecast shift', value: formatDuration(eta?.etaShiftMinutes, { signed: true }), mono: true },
        { label: 'Est. exposure', value: formatUsd(ex?.estimatedUsd), mono: true, hint: ex?.formulaText },
        { label: 'Distance remaining', value: formatNm(vo.remainingNmAsOf), mono: true },
        { label: 'Route', value: c.byId.route.get(vo.routeId)?.corridorName ?? vo.routeId },
      ],
      links: [{ label: 'Open vessel', ref: { kind: 'vessel', id: vo.vesselId } }, ...(c.incidentsByVoyage.get(id) ?? []).filter((i) => s.incidents.get(i.incidentId)?.visible).map((i) => ({ label: `Incident ${i.incidentId}`, ref: { kind: 'incident' as const, id: i.incidentId } }))],
    };
  }
  if (kind === 'incident') {
    const inc = c.byId.incident.get(id);
    const st = s.incidents.get(id);
    if (!inc || !st) return null;
    const ex = s.exposures.get(inc.voyageId);
    return {
      kindLabel: 'Incident',
      title: inc.title,
      subtitle: `${inc.incidentId} · ${c.byId.vessel.get(inc.vesselId)?.name ?? inc.vesselId}`,
      chips: [statusStyle('severity', inc.severity), statusStyle('incident', st.status)],
      fields: [
        { label: 'Category', value: sentenceCase(inc.category) },
        { label: 'Opened', value: formatUtc(inc.openedAtUtc), mono: true },
        { label: 'Owner', value: st.ownerUserId ? (c.byId.user.get(st.ownerUserId)?.displayName ?? st.ownerUserId) : 'Unassigned' },
        { label: 'Port', value: portName(inc.portId) },
        { label: 'Voyage exposure', value: formatUsd(ex?.estimatedUsd), mono: true, hint: ex?.formulaText },
        { label: 'Evidence items', value: String(inc.evidenceIds.length), mono: true },
      ],
      links: [
        { label: 'Open vessel', ref: { kind: 'vessel', id: inc.vesselId } },
        { label: `Voyage ${inc.voyageId}`, ref: { kind: 'voyage', id: inc.voyageId } },
      ],
      note: st.visible ? undefined : 'This incident had not been opened yet at the selected replay time.',
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
    return {
      kindLabel: 'Weather hazard',
      title: `${sentenceCase(h.type)} · ${sentenceCase(h.severity)}`,
      subtitle: `${h.hazardId} · Scenario model`,
      chips: [{ tone: phase === 'active' ? (h.severity === 'severe' ? 'critical' : 'warning') : 'unknown', label: phaseLabel, icon: phase === 'active' ? 'alert' : 'clock' }, statusStyle('confidence', h.confidence)],
      fields: [
        { label: 'Issued', value: formatUtc(h.issuedAtUtc), mono: true },
        { label: 'Valid from', value: formatUtc(h.validFromUtc), mono: true },
        { label: 'Valid to', value: formatUtc(h.validToUtc), mono: true },
        { label: 'Affected voyages', value: String(h.affectedVoyageIds.length), mono: true },
        { label: 'Affected corridors', value: h.affectedRouteIds.map((rid) => c.byId.route.get(rid)?.corridorName ?? rid).join(', ') || 'None listed' },
      ],
      links: [
        ...h.affectedRouteIds.map((rid) => ({ label: `Corridor ${rid}`, ref: { kind: 'route' as const, id: rid } })),
        ...h.affectedVoyageIds.slice(0, 6).map((vid) => ({ label: `Voyage ${vid}`, ref: { kind: 'voyage' as const, id: vid } })),
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
      <FieldList :fields="model.fields" />
      <div v-if="model.links.length" class="links">
        <button v-for="l in model.links" :key="l.label" type="button" class="btn btn--sm" @click="nav.openEntity(l.ref)">{{ l.label }}</button>
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
