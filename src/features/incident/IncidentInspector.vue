<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatUtc } from '@/core/format';
import { buildIncidentModel } from '@/selectors/incident';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSessionStore } from '@/stores/session';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore, type IncidentTab } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import { handoffSummary } from '@/workflows/handoff';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import FieldList from '@/components/ui/FieldList.vue';
import ProvenanceButton from '@/components/ui/ProvenanceButton.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import VoyageImpactCard from '@/features/inspectors/VoyageImpactCard.vue';
import IncidentActions from './IncidentActions.vue';

const props = defineProps<{ incidentId: string }>();
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const session = useSessionStore();
const clock = useClockStore();
const wf = useWorkflowStore();
const notices = useNoticeStore();
const nav = useNavigation();

const model = computed(() => (catalog.catalog && snap.snapshot ? buildIncidentModel(catalog.catalog, snap.snapshot, wf.state, session.user, props.incidentId) : null));
const tabs: { id: IncidentTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'actions', label: 'Actions' },
];
const localTime = ref(false);
const asOfText = computed(() => formatUtc(clock.timeMs));

const FRESHNESS_STYLE = {
  fresh: { tone: 'healthy', label: 'Fresh', icon: 'check' },
  aging: { tone: 'warning', label: 'Aging', icon: 'clock' },
  stale: { tone: 'critical', label: 'Stale', icon: 'alert' },
  unknown: { tone: 'unknown', label: 'Age unknown', icon: 'question' },
} as const;

async function copyHandoff() {
  const c = catalog.catalog;
  const s = snap.snapshot;
  if (!c || !s) return;
  try {
    await navigator.clipboard.writeText(handoffSummary(c, s, wf.state, props.incidentId));
    notices.push('Handoff summary copied.', 'success');
  } catch {
    notices.push('Clipboard is unavailable in this browser.', 'warning');
  }
}
</script>

<template>
  <InspectorDrawer
    v-if="model"
    :title="model.incident.title"
    kind-label="Incident investigation"
    :tabs="tabs"
    :active-tab="view.incidentTab"
    :expanded="view.inspectorExpanded"
    @update:active-tab="view.incidentTab = $event"
    @update:expanded="view.inspectorExpanded = $event"
    @close="nav.closeSelection()"
  >
    <template #subtitle>
      <span class="sub mono">{{ model.incident.incidentId }} · {{ model.vesselName }}</span>
      <div class="chips" data-testid="incident-chips">
        <StatusChip :status="model.severityStyle" dense />
        <StatusChip :status="model.statusStyle" dense data-testid="incident-status" />
        <StatusChip :status="{ tone: 'neutral', label: model.ageText, icon: 'clock' }" dense />
        <StatusChip :status="{ tone: model.state.ownerUserId ? 'neutral' : 'warning', label: model.ownerName, icon: 'user' }" dense data-testid="incident-owner" />
        <StatusChip :status="model.confidenceStyle" dense />
        <StatusChip v-if="model.needsVerification" :status="{ tone: 'warning', label: 'Needs verification', icon: 'question' }" dense />
        <StatusChip v-if="model.state.locallyModified" :status="{ tone: 'selected', label: 'Local decision', icon: 'check' }" dense />
      </div>
    </template>

    <template #banner>
      <p v-if="!model.state.visible" class="banner">This incident had not been opened at {{ asOfText }}.</p>
      <p v-else-if="clock.mode === 'replay'" class="banner">Replay shows the recorded case history. Local decisions are recorded at Now (simulated).</p>
    </template>

    <section v-if="view.incidentTab === 'summary'" class="stack" data-testid="incident-summary">
      <div class="callout">
        <p><strong>Effect.</strong> {{ model.effectText }}</p>
        <p><strong>Cause.</strong> {{ model.causeText }}</p>
        <p class="callout__meta">As of {{ asOfText }} · synthetic scenario data · estimate, not invoice or demurrage</p>
      </div>
      <div>
        <h3 class="section-title">Voyage {{ model.incident.voyageId }} impact</h3>
        <VoyageImpactCard :impact="model.impact" />
      </div>
      <div v-if="model.priority" class="priority">
        <h3 class="section-title">Why this is prioritised <span class="section-note mono">score {{ model.priority.score }}</span></h3>
        <ul class="priority__list">
          <li v-for="r in model.priority.rationale" :key="r">{{ r }}</li>
        </ul>
      </div>
      <div v-if="model.related.length">
        <h3 class="section-title">Other alerts on this voyage</h3>
        <p class="form-hint">Exposure is counted once per voyage, not once per alert.</p>
        <div class="links">
          <button v-for="r in model.related" :key="r.incidentId" type="button" class="btn btn--sm" @click="nav.openEntity({ kind: 'incident', id: r.incidentId })">
            {{ r.incidentId }} · {{ r.style.label }}
          </button>
        </div>
      </div>
      <FieldList :fields="model.facts" />
      <div class="links">
        <button type="button" class="btn btn--sm" @click="nav.openEntity({ kind: 'vessel', id: model.incident.vesselId })">Open vessel</button>
        <button type="button" class="btn btn--sm" @click="nav.openEntity({ kind: 'voyage', id: model.incident.voyageId })">Voyage {{ model.incident.voyageId }}</button>
        <button type="button" class="btn btn--sm" data-testid="copy-handoff" @click="copyHandoff">Copy handoff summary</button>
      </div>
    </section>

    <section v-else-if="view.incidentTab === 'evidence'" class="stack" data-testid="incident-evidence">
      <div>
        <h3 class="section-title">Computed evidence</h3>
        <FieldList :fields="model.computedEvidence" />
      </div>
      <div>
        <h3 class="section-title">Recorded evidence <span class="section-note">{{ model.evidence.length }} items</span></h3>
        <ul v-if="model.evidence.length" class="evidence">
          <li v-for="e in model.evidence" :key="e.evidenceId" class="evidence__item">
            <div class="evidence__head">
              <span class="evidence__label">{{ e.label }}</span>
              <ProvenanceButton :provenance="e.provenance" :label="e.label" />
            </div>
            <strong class="mono">{{ e.valueText }}</strong>
            <div class="evidence__meta">
              <StatusChip :status="FRESHNESS_STYLE[e.freshness]" dense />
              <span class="mono">{{ e.observedText }} · {{ e.ageText }}</span>
            </div>
            <span class="evidence__src mono">{{ e.evidenceId }} · {{ e.qualityLabel }} · {{ e.sourceLabel }}</span>
          </li>
        </ul>
        <p v-else class="empty-state">Insufficient evidence at this time. No conclusion can be drawn from the recorded data.</p>
        <p v-if="model.evidenceHidden" class="form-hint">{{ model.evidenceHidden }} later evidence items are hidden at this replay time.</p>
      </div>
    </section>

    <section v-else-if="view.incidentTab === 'timeline'" class="stack" data-testid="incident-timeline">
      <div class="form-row tl-toggle" role="group" aria-label="Time zone">
        <button type="button" class="btn btn--sm" :aria-pressed="!localTime" @click="localTime = false">UTC</button>
        <button type="button" class="btn btn--sm" :aria-pressed="localTime" @click="localTime = true">Local ({{ model.portTimeZone }})</button>
      </div>
      <ol class="timeline">
        <li v-for="r in model.timeline" :key="r.key" :class="`timeline__item timeline__item--${r.kind}`">
          <span class="timeline__time mono">{{ localTime ? r.localText : r.utcText }}</span>
          <span class="timeline__label">{{ r.label }}</span>
          <span v-if="r.actor" class="timeline__meta">{{ r.actor }} · local demo action</span>
          <span v-if="r.detail" class="timeline__meta">{{ r.detail }}</span>
          <button v-if="r.ref && r.ref.id !== model.incident.incidentId" type="button" class="timeline__link" @click="nav.openEntity(r.ref)">Open {{ r.ref.kind }} {{ r.ref.id }}</button>
        </li>
      </ol>
      <p v-if="!model.timeline.length" class="empty-state">No events recorded for this case up to this time.</p>
      <p v-if="model.localHiddenInReplay" class="form-hint">{{ model.localHiddenInReplay }} local demo actions were recorded at Now and are hidden in replay.</p>
    </section>

    <section v-else data-testid="incident-actions">
      <IncidentActions :key="model.incident.incidentId" :model="model" />
    </section>
  </InspectorDrawer>
  <div v-else class="drawer-missing panel" role="alert">Incident {{ incidentId }} is not in the simulated dataset.</div>
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
  margin: 0 var(--space-5) var(--space-3);
  padding: 8px 12px;
  border-radius: var(--radius-input);
  background: var(--color-info-subtle);
  color: var(--color-info);
  font-size: var(--text-12);
}
.stack {
  display: grid;
  gap: var(--space-4);
}
.callout {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
  font-size: var(--text-12);
}
.callout__meta {
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
.priority__list {
  margin: 0;
  padding-left: 16px;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.evidence {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.evidence__item {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
}
.evidence__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.evidence__label {
  color: var(--color-ink-secondary);
}
.evidence__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.evidence__src {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.tl-toggle .btn[aria-pressed='true'] {
  border-color: var(--color-ink);
  font-weight: 600;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline__item {
  display: grid;
  gap: 2px;
  padding: 8px 0 8px 14px;
  border-left: 2px solid var(--color-border);
  position: relative;
  font-size: var(--text-12);
}
.timeline__item::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 13px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-panel);
  border: 2px solid var(--color-ink-muted);
}
.timeline__item--local::before {
  border-color: var(--color-accent);
  background: var(--color-accent);
}
.timeline__time,
.timeline__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.timeline__link {
  justify-self: start;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-info);
  font-size: var(--text-11);
  text-decoration: underline;
}
.drawer-missing {
  position: absolute;
  top: 12px;
  right: 12px;
  width: var(--inspector-w);
  padding: 16px;
}
</style>
