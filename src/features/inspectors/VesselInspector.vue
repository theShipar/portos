<script setup lang="ts">
import { computed, toRef } from 'vue';
import { flags } from '@/core/flags';
import { auditRows } from '@/selectors/activity';
import { selectCruiseProgress } from '@/selectors/vesselCargo';
import { selectPortCallValue } from '@/selectors/portCall';
import { buildVesselInspector } from '@/selectors/vessel';
import { actionableEvents, routeProgress, vesselPriorities, type Priority } from '@/selectors/vesselBrief';
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
import ShipSilhouette from '@/components/ui/ShipSilhouette.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import ProgressTrack from '@/components/ui/ProgressTrack.vue';
import CargoPanel from './CargoPanel.vue';
import CargoDetail from './CargoDetail.vue';
import PortCallCard from './PortCallCard.vue';
import VesselWorkshop from './VesselWorkshop.vue';
import VoyageImpactCard from './VoyageImpactCard.vue';
import { useVesselCargo } from './useVesselCargo';

const props = defineProps<{ vesselId: string }>();
const v3 = flags.v3ShipPreview;
const EMPTY_FILLED = new Map<string, { swatch: number; restricted: boolean }>();
const {
  status: cargoStatus,
  modelKey,
  plan: cargoPlan,
  workshop,
  summary: cargoSummary,
  focus: cargoFocus,
  hold: cargoHold,
  mode: camMode,
  exploded,
  bay: cargoBay,
  baySection,
  detail: cargoDetail,
  setFocus,
  setHold,
  setBay,
  setMode,
  setExploded,
} = useVesselCargo(toRef(props, 'vesselId'));

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const clock = useClockStore();
const wf = useWorkflowStore();
const nav = useNavigation();

const model = computed(() => (catalog.catalog && snap.snapshot ? buildVesselInspector(catalog.catalog, snap.snapshot, props.vesselId) : null));
const portCall = computed(() => (catalog.catalog && snap.snapshot ? selectPortCallValue(catalog.catalog, snap.snapshot, props.vesselId) : null));
const progress = computed(() => (catalog.catalog && snap.snapshot ? routeProgress(catalog.catalog, snap.snapshot, props.vesselId) : null));
const cruise = computed(() => (v3 && catalog.catalog && snap.snapshot ? selectCruiseProgress(catalog.catalog, snap.snapshot, props.vesselId) : null));
const priorities = computed(() => (model.value ? vesselPriorities(model.value, portCall.value) : []));
const recent = computed(() => (catalog.catalog && model.value ? actionableEvents(catalog.catalog, model.value) : []));
const silhouetteTone = computed(() => (model.value?.activeIncident ? 'critical' : model.value?.positionStale ? 'unknown' : model.value?.impact?.shiftTone === 'warning' || model.value?.impact?.shiftTone === 'critical' ? 'warning' : 'ok'));
function runPriority(p: Priority) {
  if (!p.action) return;
  if ('target' in p.action) nav.openEntity(p.action.target);
  else nav.openCompare(p.action.compareVoyageId);
}
function jumpTo(ms: number) {
  clock.pause();
  clock.seekMs(ms);
}
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

    <section v-if="view.inspectorTab === 'overview' && v3" class="stack" data-testid="vessel-overview-v3">
      <div class="identity" data-testid="vessel-identity">
        <VesselWorkshop
          :vessel-name="model.name"
          :vessel-type="model.vesselType"
          :model-key="modelKey"
          :plan="cargoPlan"
          :filled="workshop?.filled ?? EMPTY_FILLED"
          :selected="cargoFocus"
          :hold="cargoHold"
          :hold-of-slot="workshop?.holdOfSlot ?? null"
          :mode="camMode"
          :exploded="exploded"
          @pick="setFocus"
          @update:mode="setMode"
          @update:exploded="setExploded"
        >
          <template #annotation>
            <CargoDetail v-if="cargoDetail" :detail="cargoDetail" :focus="cargoFocus" @focus="setFocus" />
            <p v-else class="empty">Select a compartment or cargo slot in the model or the picker below to view its details.</p>
          </template>
          <template #cargo>
            <CargoPanel v-if="cargoSummary && cargoPlan" :summary="cargoSummary" :plan="cargoPlan" :section="baySection" :bay="cargoBay" :hold="cargoHold" :focus="cargoFocus" :detail="cargoDetail" hide-detail @focus="setFocus" @hold="setHold" @bay="setBay" />
            <p v-else class="empty">No cargo modelled for this vessel in the simulated dataset.</p>
          </template>
        </VesselWorkshop>
        <div class="identity__line">
          <span class="identity__note">Procedural inspection model · not to scale</span>
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
      </div>

      <div v-if="cruise" class="cruise" data-testid="route-progress" :data-basis="cruise.basis" :title="cruise.basisText">
        <ProgressTrack
          :origin="cruise.origin"
          :destination="cruise.destination"
          :origin-caption="cruise.originCaption"
          :destination-caption="cruise.destinationCaption"
          :progress="cruise.progress"
          :label="cruise.label"
          :value-text="cruise.valueText"
          :tone="cruise.tone"
        />
        <span class="cruise__meta num">{{ cruise.progressText }} · {{ cruise.remainingText }}</span>
      </div>
      <p v-else class="progress__none" data-testid="route-progress" data-basis="none">No assigned voyage · Simulated tracking only</p>

      <p v-if="cargoStatus === 'loading' || cargoStatus === 'idle'" class="empty" data-testid="cargo-loading">Loading simulated cargo…</p>
      <p v-else-if="cargoStatus === 'error'" class="empty" data-testid="cargo-error">Simulated cargo module unavailable; vessel data is unaffected.</p>
      <CargoPanel
        v-else-if="cargoSummary && cargoPlan"
        :summary="cargoSummary"
        :plan="cargoPlan"
        :section="baySection"
        :bay="cargoBay"
        :hold="cargoHold"
        :focus="cargoFocus"
        :detail="cargoDetail"
        @focus="setFocus"
        @hold="setHold"
        @bay="setBay"
      />
      <p v-else class="empty" data-testid="cargo-none">No cargo modelled for this vessel in the simulated dataset.</p>

      <div data-testid="vessel-priorities">
        <h3 class="section-title">Priorities <span class="section-note">Simulated</span></h3>
        <ol v-if="priorities.length" class="priorities">
          <li v-for="p in priorities" :key="p.key" class="priority" :class="`priority--${p.tone}`" :data-testid="`priority-${p.key}`">
            <div class="priority__text">
              <strong>{{ p.label }}</strong>
              <span>{{ p.detail }}</span>
            </div>
            <button v-if="p.action" type="button" class="btn btn--sm" @click="runPriority(p)">{{ p.action.label }}</button>
          </li>
        </ol>
        <p v-else class="empty">No open case, ETA slip or port wait for this vessel at the selected time.</p>
      </div>
      <VoyageImpactCard v-if="model.impact" :impact="model.impact" />
      <PortCallCard v-if="portCall" :value="portCall" />
      <div v-if="recent.length" data-testid="vessel-recent-events">
        <h3 class="section-title">Latest events <span class="section-note">jump to replay that moment</span></h3>
        <ul class="recent">
          <li v-for="e in recent" :key="e.eventId">
            <span class="mono recent__time">{{ e.timeText }}</span>
            <span class="recent__label">{{ e.label }}</span>
            <button type="button" class="icon-btn" :aria-label="`Go to ${e.timeText}`" title="Set the simulation clock to this event" :data-testid="`event-jump-${e.eventId}`" @click="jumpTo(e.ms)">
              <Icon name="clock" :size="14" />
            </button>
          </li>
        </ul>
      </div>
      <div data-testid="vessel-position" :data-time-ms="snap.snapshot?.timeMs" :data-lat="model.point?.lat" :data-lon="model.point?.lon">
        <h3 class="section-title">Position <span class="section-note">{{ model.positionLabel }}</span></h3>
        <FieldList :fields="model.position" />
      </div>
      <details class="specs" data-testid="vessel-specs">
        <summary>Specifications <span class="section-note">{{ model.vesselType }}</span></summary>
        <FieldList :fields="model.identity" />
      </details>
    </section>

    <section v-else-if="view.inspectorTab === 'overview'" class="stack">
      <div class="preview" data-testid="vessel-preview">
        <ShipSilhouette :vessel-type="model.vesselType" :tone="silhouetteTone" />
        <div v-if="progress" class="progress" data-testid="route-progress" :data-basis="progress.basis">
          <div class="progress__ends">
            <span>{{ progress.originName }}</span>
            <span class="progress__pct num">{{ progress.progressText }}</span>
            <span>{{ progress.destinationName }}</span>
          </div>
          <div class="progress__bar" role="progressbar" :aria-valuenow="progress.progressPct" aria-valuemin="0" aria-valuemax="100" :aria-label="`Route progress ${progress.progressText}`" :title="progress.basisText">
            <span class="progress__fill" :style="{ width: progress.progressText }" />
          </div>
          <div class="progress__meta">
            <span class="num">{{ progress.remainingText }}</span>
            <span class="mono">{{ progress.etaText }}</span>
          </div>
        </div>
        <p v-else class="progress__none">No assigned voyage · Simulated tracking only</p>
      </div>

      <div data-testid="vessel-priorities">
        <h3 class="section-title">Priorities <span class="section-note">Simulated</span></h3>
        <ol v-if="priorities.length" class="priorities">
          <li v-for="p in priorities" :key="p.key" class="priority" :class="`priority--${p.tone}`" :data-testid="`priority-${p.key}`">
            <div class="priority__text">
              <strong>{{ p.label }}</strong>
              <span>{{ p.detail }}</span>
            </div>
            <button v-if="p.action" type="button" class="btn btn--sm" @click="runPriority(p)">{{ p.action.label }}</button>
          </li>
        </ol>
        <p v-else class="empty">No open case, ETA slip or port wait for this vessel at the selected time.</p>
      </div>

      <VoyageImpactCard v-if="model.impact" :impact="model.impact" />
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

      <div v-if="recent.length" data-testid="vessel-recent-events">
        <h3 class="section-title">Latest events <span class="section-note">jump to replay that moment</span></h3>
        <ul class="recent">
          <li v-for="e in recent" :key="e.eventId">
            <span class="mono recent__time">{{ e.timeText }}</span>
            <span class="recent__label">{{ e.label }}</span>
            <button type="button" class="icon-btn" :aria-label="`Go to ${e.timeText}`" title="Set the simulation clock to this event" :data-testid="`event-jump-${e.eventId}`" @click="jumpTo(e.ms)">
              <Icon name="clock" :size="14" />
            </button>
          </li>
        </ul>
      </div>

      <div data-testid="vessel-position" :data-time-ms="snap.snapshot?.timeMs" :data-lat="model.point?.lat" :data-lon="model.point?.lon">
        <h3 class="section-title">Position <span class="section-note">{{ model.positionLabel }}</span></h3>
        <FieldList :fields="model.position" />
      </div>
      <details class="specs" data-testid="vessel-specs">
        <summary>Specifications <span class="section-note">{{ model.vesselType }}</span></summary>
        <FieldList :fields="model.identity" />
      </details>
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
  border: 1px solid color-mix(in srgb, var(--color-critical) 40%, transparent);
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
.preview {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.progress {
  display: grid;
  gap: 4px;
  font-size: var(--text-12);
}
.progress__ends,
.progress__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.progress__meta {
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
}
.progress__pct {
  font-weight: 600;
}
.progress__bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
}
.progress__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-data-observed);
}
.progress__none {
  margin: 0;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.priorities {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.priority {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-left: 3px solid var(--color-unknown);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.priority--critical {
  border-left-color: var(--color-critical);
  background: var(--color-critical-subtle);
}
.priority--warning {
  border-left-color: var(--color-warning);
  background: var(--color-warning-subtle);
}
.priority--info {
  border-left-color: var(--color-info);
  background: var(--color-info-subtle);
}
.priority__text {
  flex: 1;
  display: grid;
  min-width: 0;
  font-size: var(--text-12);
  line-height: 16px;
}
.priority__text span {
  color: var(--color-ink-secondary);
}
.recent {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.recent li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--text-12);
}
.recent__time {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.recent__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specs summary {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  cursor: pointer;
  font-size: var(--text-14);
  font-weight: 600;
}
.specs[open] summary {
  margin-bottom: 4px;
}
.identity {
  display: grid;
  gap: 8px;
}
.identity__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.identity__note {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.cruise {
  display: grid;
  gap: 6px;
}
.cruise__meta {
  font-size: var(--text-11);
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
