<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { buildQueueRows, filterQueueRows, QUEUE_TOP_N } from '@/selectors/queue';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import Icon from '@/components/ui/Icon.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const wf = useWorkflowStore();
const nav = useNavigation();
const searchId = useId();

const query = ref('');
const showAll = ref(false);
const expanded = ref<string | null>(null);

const regionId = computed(() => (view.scope.level === 'region' ? view.scope.regionId : null));
const regionName = computed(() => (regionId.value ? (catalog.catalog?.byId.region.get(regionId.value)?.name ?? regionId.value) : 'All regions'));
const all = computed(() => (catalog.catalog && snap.snapshot ? buildQueueRows(catalog.catalog, snap.snapshot, wf.state, regionId.value) : []));
const matches = computed(() => filterQueueRows(all.value, query.value));
const rows = computed(() => (showAll.value || query.value ? matches.value : matches.value.slice(0, QUEUE_TOP_N)));
const hiddenCount = computed(() => matches.value.length - rows.value.length);
const selectedId = computed(() => (view.selection?.kind === 'incident' ? view.selection.id : null));
const drilling = computed(() => view.kpiDrill === 'unresolvedIncidents');

function open(id: string) {
  nav.openEntity({ kind: 'incident', id });
}
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id;
}
</script>

<template>
  <section class="queue" :class="{ 'queue--closed': !view.incidentQueueOpen }" aria-label="Exception queue" data-testid="incident-queue">
    <header class="queue__head">
      <div>
        <p class="queue__kicker">Exception queue · {{ regionName }}</p>
        <h2 class="queue__title">
          <span class="num">{{ all.length }}</span> unresolved {{ all.length === 1 ? 'case' : 'cases' }}
        </h2>
      </div>
      <button
        type="button"
        class="queue__toggle"
        :aria-expanded="view.incidentQueueOpen"
        :aria-label="view.incidentQueueOpen ? 'Collapse exception queue' : 'Expand exception queue'"
        data-testid="incident-queue-toggle"
        @click="view.incidentQueueOpen = !view.incidentQueueOpen"
      >
        <Icon :name="view.incidentQueueOpen ? 'chevron-left' : 'chevron-right'" :size="16" />
      </button>
    </header>
    <template v-if="view.incidentQueueOpen">
      <div class="queue__tools">
        <label :for="searchId" class="sr-only">Filter cases</label>
        <input :id="searchId" v-model="query" type="search" class="control queue__search" placeholder="Filter by vessel, port, ID" data-testid="incident-queue-search" />
        <button type="button" class="btn btn--sm" :aria-pressed="drilling" data-testid="incident-queue-map" @click="nav.setKpiDrill(drilling ? null : 'unresolvedIncidents')">
          {{ drilling ? 'Clear map filter' : 'Show on map' }}
        </button>
      </div>
      <p class="queue__meta">Ordered by priority score: severity, exposure, age, status and confidence. Not a dispatch order.</p>
      <ol class="queue__list" aria-label="Cases by priority">
        <li v-for="(r, i) in rows" :key="r.caseId" class="case" :class="{ 'case--selected': r.caseId === selectedId }">
          <div class="case__row">
            <button type="button" class="case__open" :aria-current="r.caseId === selectedId ? 'true' : undefined" :data-testid="`queue-case-${r.caseId}`" @click="open(r.caseId)">
              <span class="case__rank num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="case__main">
                <strong>{{ r.title }}</strong>
                <span class="case__sub">{{ r.vesselName }} · {{ r.portName }}</span>
                <span class="case__chips">
                  <StatusChip :status="r.severityStyle" dense />
                  <StatusChip :status="r.statusStyle" dense />
                  <StatusChip v-if="r.needsVerification" :status="{ tone: 'unknown', label: 'Needs verification', icon: 'question' }" dense />
                </span>
              </span>
              <span class="case__nums num">
                <span>{{ r.exposureText }}</span>
                <span class="case__sub">{{ r.ageText }}</span>
                <span class="case__sub">{{ r.ownerName ?? 'Unassigned' }}</span>
              </span>
            </button>
            <button
              type="button"
              class="case__why"
              :aria-expanded="expanded === r.caseId"
              :aria-label="`Why ${r.caseId} is ranked here`"
              :data-testid="`queue-why-${r.caseId}`"
              @click="toggle(r.caseId)"
            >
              <Icon :name="expanded === r.caseId ? 'chevron-down' : 'info'" :size="14" />
            </button>
          </div>
          <div v-if="expanded === r.caseId" class="case__detail">
            <p class="case__score">
              Score <strong class="num">{{ r.score }}</strong> · {{ r.caseId }}
            </p>
            <ul>
              <li v-for="line in r.rationale" :key="line">{{ line }}</li>
            </ul>
            <p v-if="r.dedupedIds.length" class="case__note">Includes {{ r.dedupedIds.join(', ') }} (same voyage and category within 6 h).</p>
            <p v-if="r.relatedOnVoyage.length" class="case__note">Also on this voyage: {{ r.relatedOnVoyage.join(', ') }}. Exposure is counted once per voyage.</p>
          </div>
        </li>
        <li v-if="!rows.length" class="queue__empty">{{ query ? 'No cases match this filter.' : 'No unresolved cases in this scope.' }}</li>
      </ol>
      <button v-if="hiddenCount > 0" type="button" class="linkish" data-testid="incident-queue-more" @click="showAll = true">Show all {{ matches.length }} cases</button>
      <button v-else-if="showAll && !query && matches.length > QUEUE_TOP_N" type="button" class="linkish" @click="showAll = false">Show top {{ QUEUE_TOP_N }}</button>
    </template>
  </section>
</template>

<style scoped>
.queue {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 8px;
  width: 360px;
  min-height: 0;
  max-height: 100%;
  padding: 12px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.queue--closed {
  grid-template-rows: auto;
  width: 240px;
}
.queue__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 8px;
}
.queue__kicker {
  margin: 0;
  font-size: var(--text-11);
  font-weight: 500;
  color: var(--color-ink-muted);
}
.queue__title {
  margin: 0;
  font-size: var(--text-14);
  line-height: 20px;
}
.queue__toggle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.queue__tools {
  display: flex;
  gap: 6px;
}
.queue__search {
  flex: 1;
  min-width: 0;
  height: 28px;
}
.queue__meta {
  margin: 0;
  font-size: var(--text-11);
  line-height: 14px;
  color: var(--color-ink-muted);
}
.queue__list {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 0;
  margin: 0 -4px;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.case {
  border-radius: var(--radius-input);
}
.case--selected {
  background: var(--color-accent-subtle);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}
.case__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
}
.case__open {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 8px;
  width: 100%;
  padding: 6px 4px 6px 6px;
  border: 0;
  border-radius: var(--radius-input);
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: var(--text-12);
  line-height: 16px;
  color: var(--color-ink);
  cursor: pointer;
}
.case__open:hover {
  background: var(--color-panel-secondary);
}
.case__rank {
  color: var(--color-ink-muted);
  font-weight: 600;
}
.case__main,
.case__nums {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.case__main strong {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.case__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.case__nums {
  justify-items: end;
  white-space: nowrap;
}
.case__sub {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case__why {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: 6px 4px 0 0;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.case__why:hover,
.case__why[aria-expanded='true'] {
  border-color: var(--color-border);
  background: var(--color-panel);
}
.case__detail {
  margin: 0 8px 8px 32px;
  padding: 8px;
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
  font-size: var(--text-12);
  line-height: 16px;
}
.case__detail ul {
  margin: 4px 0 0;
  padding-left: 16px;
}
.case__score,
.case__note {
  margin: 0;
}
.case__note {
  margin-top: 4px;
  color: var(--color-ink-secondary);
}
.queue__empty {
  padding: 8px;
  color: var(--color-ink-muted);
  font-size: var(--text-12);
}
.linkish {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-ink);
  font: inherit;
  font-size: var(--text-12);
  cursor: pointer;
}
</style>
