<script setup lang="ts">
import { computed } from 'vue';
import { auditRows } from '@/selectors/activity';
import { selectPortCallValue } from '@/selectors/portCall';
import { buildVesselInspector } from '@/selectors/vessel';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore, type InspectorTab } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import { auditFor } from '@/workflows/handoff';
import TaskPanel from '@/features/workflow/TaskPanel.vue';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import FieldList from '@/components/ui/FieldList.vue';
import Icon from '@/components/ui/Icon.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import PortCallCard from './PortCallCard.vue';
import VoyageImpactCard from './VoyageImpactCard.vue';

const props = defineProps<{ vesselId: string }>();

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const clock = useClockStore();
const wf = useWorkflowStore();
const nav = useNavigation();

const model = computed(() => (catalog.catalog && snap.snapshot ? buildVesselInspector(catalog.catalog, snap.snapshot, props.vesselId) : null));
const portCall = computed(() => (catalog.catalog && snap.snapshot ? selectPortCallValue(catalog.catalog, snap.snapshot, props.vesselId) : null));
const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'voyage', label: 'Voyage' },
  { id: 'events', label: 'Events' },
  { id: 'documents', label: 'Documents' },
];
const following = computed(() => view.follow?.vesselId === props.vesselId);
function toggleFollow() {
  if (following.value) view.stopFollow();
  else view.startFollow(props.vesselId);
}
const localAudit = computed(() => (catalog.catalog ? auditRows(catalog.catalog, auditFor(catalog.catalog, wf.state, { kind: 'vessel', id: props.vesselId })) : []));
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
      <VoyageImpactCard v-if="model.impact" :impact="model.impact" />
      <div v-else class="empty">No assigned voyage. Identity and tracking remain available below.</div>
      <PortCallCard v-if="portCall" :value="portCall" />
      <div class="links">
        <button
          type="button"
          class="btn btn--sm"
          :class="{ 'btn--active': following }"
          :aria-pressed="following"
          :disabled="view.viewMode !== '3d'"
          :title="view.viewMode !== '3d' ? 'Switch to 3D to follow the vessel.' : 'Camera follows the vessel through playback'"
          data-testid="vessel-follow"
          @click="toggleFollow"
        >
          <Icon name="crosshair" :size="14" /> {{ following ? 'Following' : 'Follow' }}
        </button>
      </div>

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
        <div class="links">
          <button type="button" class="btn btn--sm" @click="nav.openEntity({ kind: 'voyage', id: model.voyage.voyageId })">Open voyage {{ model.voyage.voyageId }}</button>
          <button type="button" class="btn btn--sm" data-testid="open-replay" @click="nav.openReplay(model.voyage.voyageId)">Replay voyage</button>
        </div>
      </template>
      <div v-else class="empty">No assigned voyage for this vessel in the simulated dataset.</div>
    </section>

    <section v-else-if="view.inspectorTab === 'events'" class="stack">
      <div data-testid="vessel-local-audit">
        <h3 class="section-title">Local decisions <span class="section-note">demo, this browser only</span></h3>
        <p v-if="clock.phase === 'history'" class="empty">Local decisions are recorded at Now (simulated) and are hidden while replaying history.</p>
        <ol v-else-if="localAudit.length" class="events">
          <li v-for="a in localAudit" :key="a.auditId">
            <span class="events__time mono">{{ a.simText }}</span>
            <span class="events__label">{{ a.summary }}</span>
            <span class="events__meta mono">{{ a.actorText }} · {{ a.refsText }}</span>
          </li>
        </ol>
        <p v-else class="empty">No local decisions on this vessel, its voyages or its cases yet.</p>
      </div>
      <div v-if="model.voyage">
        <h3 class="section-title">Voyage tasks <span class="section-note">{{ model.voyage.voyageId }}</span></h3>
        <TaskPanel :voyage-id="model.voyage.voyageId" :allow-create="false" />
      </div>
      <h3 class="section-title">Simulated events</h3>
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
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
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
