<script setup lang="ts">
import { computed } from 'vue';
import { formatUtc } from '@/core/format';
import { buildVesselInspector } from '@/selectors/vessel';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore, type InspectorTab } from '@/stores/view';
import { statusStyle } from '@/styles/tokens';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import FieldList from '@/components/ui/FieldList.vue';
import Icon from '@/components/ui/Icon.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = defineProps<{ vesselId: string }>();

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();

const model = computed(() => (catalog.catalog && snap.snapshot ? buildVesselInspector(catalog.catalog, snap.snapshot, props.vesselId) : null));
const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'voyage', label: 'Voyage' },
  { id: 'events', label: 'Events' },
  { id: 'documents', label: 'Documents' },
];
const voyage = computed(() => (model.value?.voyage ? catalog.catalog?.byId.voyage.get(model.value.voyage.voyageId) ?? null : null));

function openPort(portId: string) {
  const regionId = catalog.catalog?.byId.port.get(portId)?.regionId ?? '';
  nav.openScope({ level: 'port', portId, regionId });
}
</script>

<template>
  <InspectorDrawer
    v-if="model"
    :title="model.name"
    kind-label="Vessel"
    :tabs="tabs"
    :active-tab="view.inspectorTab"
    :expanded="view.inspectorExpanded"
    @update:active-tab="view.inspectorTab = $event"
    @update:expanded="view.inspectorExpanded = $event"
    @close="nav.closeSelection()"
  >
    <template #subtitle>
      <div class="sub">
        <span class="mono">{{ model.subtitle }}</span>
      </div>
      <div class="chips">
        <StatusChip :status="model.navStyle" dense />
        <StatusChip :status="{ tone: model.fleet === 'own' ? 'selected' : 'neutral', label: model.fleet === 'own' ? 'Managed fleet' : 'Ambient', icon: 'ship' }" dense />
        <StatusChip v-if="model.positionStale" :status="{ tone: 'unknown', label: model.positionLabel, icon: 'clock' }" dense />
      </div>
    </template>

    <template #banner>
      <div v-if="model.activeIncident" class="banner" role="status">
        <StatusChip :status="model.activeIncident.severityStyle" dense />
        <div class="banner__text">
          <strong class="mono">{{ model.activeIncident.incidentId }}</strong>
          <span>{{ model.activeIncident.title }}</span>
        </div>
        <button type="button" class="btn btn--sm btn--primary" @click="nav.openEntity({ kind: 'incident', id: model.activeIncident.incidentId })">Investigate delay</button>
      </div>
    </template>

    <section v-if="view.inspectorTab === 'overview'" class="stack">
      <div v-if="model.eta" class="eta" data-testid="eta-block">
        <div class="eta__row">
          <div>
            <div class="micro-label">Forecast ETA shift</div>
            <div class="eta__value num" :class="`tone-${model.etaShiftTone}`" data-testid="eta-shift">{{ model.etaShiftText }}</div>
          </div>
          <div class="eta__exposure">
            <div class="micro-label">Est. delay exposure</div>
            <div class="eta__value num" data-testid="exposure-value">{{ model.exposureText }}</div>
          </div>
        </div>
        <div class="eta__grid">
          <span>Planned ETA</span><span class="mono">{{ formatUtc(model.eta.plannedArrivalUtc) }}</span>
          <span>Forecast ETA</span><span class="mono">{{ formatUtc(model.eta.estimatedArrivalUtc) }}</span>
        </div>
        <div v-if="model.eta.drivers.length" class="eta__driver">
          <Icon name="info" :size="14" />
          <span>Driver: <strong>{{ model.eta.drivers[0].label }}</strong> · {{ model.eta.drivers[0].eventId }} at {{ formatUtc(model.eta.drivers[0].atUtc, { date: false }) }}</span>
        </div>
        <div v-if="model.exposure" class="eta__formula mono">{{ model.exposure.formulaText }}</div>
        <div class="eta__meta">
          <StatusChip :status="statusStyle('confidence', model.eta.confidence)" dense />
          <span>As of {{ formatUtc(model.eta.asOfUtc) }} · simulated estimate, not an invoice or demurrage claim</span>
        </div>
      </div>
      <div v-else class="empty">No assigned voyage. Identity and tracking remain available below.</div>

      <div>
        <h3 class="section-title">Position <span class="section-note">{{ model.positionLabel }}</span></h3>
        <FieldList :fields="model.position" />
      </div>
      <div>
        <h3 class="section-title">Identity</h3>
        <FieldList :fields="model.identity" />
      </div>
    </section>

    <section v-else-if="view.inspectorTab === 'voyage'" class="stack">
      <template v-if="model.voyage && voyage">
        <div class="legs">
          <button type="button" class="leg" @click="openPort(voyage.originPortId)">
            <span class="micro-label">Origin</span><span>{{ model.voyage.originName }}</span>
          </button>
          <Icon name="chevron-right" />
          <button type="button" class="leg" @click="openPort(voyage.destinationPortId)">
            <span class="micro-label">Destination</span><span>{{ model.voyage.destinationName }}</span>
          </button>
        </div>
        <div class="chips"><StatusChip :status="{ tone: 'info', label: model.voyage.stage, icon: 'clock' }" dense /></div>
        <FieldList :fields="model.voyage.fields" />
        <div v-if="model.eta?.assumptions.length">
          <h3 class="section-title">Assumptions</h3>
          <ul class="assumptions">
            <li v-for="a in model.eta.assumptions" :key="a">{{ a }}</li>
          </ul>
        </div>
        <button type="button" class="btn btn--sm" @click="nav.openEntity({ kind: 'voyage', id: model.voyage.voyageId })">Open voyage {{ model.voyage.voyageId }}</button>
      </template>
      <div v-else class="empty">No assigned voyage for this vessel in the simulated dataset.</div>
    </section>

    <section v-else-if="view.inspectorTab === 'events'">
      <ol v-if="model.events.length" class="events">
        <li v-for="e in model.events" :key="e.eventId">
          <span class="events__time mono">{{ e.timeUtc }}</span>
          <span class="events__label">{{ e.label }}</span>
          <span class="events__meta mono">{{ e.eventId }} · {{ e.quality }}</span>
        </li>
      </ol>
      <div v-else class="empty">No events recorded for this vessel up to {{ model.asOfText }}.</div>
    </section>

    <section v-else class="empty">
      No demo documents are attached to {{ model.name }}. The prototype does not store real cargo or certificate documents.
    </section>
  </InspectorDrawer>
  <div v-else class="drawer-missing panel" role="alert">Vessel {{ vesselId }} is not in the simulated dataset.</div>
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
.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 var(--space-5) var(--space-3);
  padding: 10px 12px;
  border: 1px solid #f1c9c4;
  border-radius: var(--radius-input);
  background: var(--color-critical-subtle);
}
.banner__text {
  flex: 1;
  display: grid;
  font-size: var(--text-12);
  line-height: 16px;
  min-width: 0;
}
.stack {
  display: grid;
  gap: var(--space-5);
}
.eta {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-panel-secondary);
}
.eta__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.eta__value {
  font-size: var(--text-24);
  line-height: 30px;
  font-weight: 600;
}
.tone-critical {
  color: var(--color-critical);
}
.tone-warning {
  color: var(--color-warning);
}
.tone-healthy {
  color: var(--color-healthy);
}
.tone-unknown {
  color: var(--color-unknown);
}
.eta__grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.eta__grid .mono {
  color: var(--color-ink);
}
.eta__driver {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: var(--text-12);
  line-height: 18px;
  color: var(--color-ink-secondary);
}
.eta__driver strong {
  color: var(--color-ink);
  font-weight: 600;
}
.eta__driver svg {
  margin-top: 2px;
  flex: none;
}
.eta__formula {
  font-size: var(--text-12);
  padding: 6px 8px;
  border-radius: var(--radius-chip);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
}
.eta__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.section-title {
  font-size: var(--text-14);
  line-height: 20px;
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.section-note {
  font-size: var(--text-11);
  font-weight: 400;
  color: var(--color-ink-muted);
}
.legs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.leg {
  flex: 1;
  display: grid;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  font-weight: 500;
}
.leg:hover {
  border-color: var(--color-accent);
}
.assumptions {
  margin: 0;
  padding-left: 18px;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.events {
  list-style: none;
  margin: 0;
  padding: 0;
}
.events li {
  display: grid;
  gap: 2px;
  padding: 9px 0 9px 12px;
  border-left: 2px solid var(--color-border);
  position: relative;
}
.events li::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 14px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-panel);
  border: 2px solid var(--color-ink-muted);
}
.events__time {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.events__label {
  font-size: var(--text-12);
}
.events__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.empty {
  padding: 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.drawer-missing {
  position: absolute;
  top: 12px;
  right: 12px;
  width: var(--inspector-w);
  padding: 16px;
}
</style>
