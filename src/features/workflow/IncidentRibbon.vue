<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { buildQueueRows, filterQueueRows, queueHeadline, QUEUE_TOP_N } from '@/selectors/queue';
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

const regionId = computed(() => (view.scope.level === 'region' || view.scope.level === 'country' || view.scope.level === 'city' ? view.scope.regionId : null));
const regionName = computed(() => (regionId.value ? (catalog.catalog?.byId.region.get(regionId.value)?.name ?? regionId.value) : 'All regions'));
const all = computed(() => (catalog.catalog && snap.snapshot ? buildQueueRows(catalog.catalog, snap.snapshot, wf.state, regionId.value) : []));
const matches = computed(() => filterQueueRows(all.value, query.value));
const rows = computed(() => (showAll.value || query.value ? matches.value : matches.value.slice(0, QUEUE_TOP_N)));
const hiddenCount = computed(() => matches.value.length - rows.value.length);
const selectedId = computed(() => (view.selection?.kind === 'incident' ? view.selection.id : null));
const drilling = computed(() => view.kpiDrill === 'unresolvedIncidents');
const headline = computed(() => queueHeadline(all.value.length));

function open(id: string) {
  nav.openEntity({ kind: 'incident', id });
}
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id;
}
</script>

<template>
  <div v-if="!all.length" class="ribbon-empty" role="status" data-testid="incident-queue-empty">
    <Icon name="check" :size="13" /> {{ headline }} · {{ regionName }}
  </div>
  <section
    v-else
    class="ribbon"
    :class="{ 'ribbon--closed': !view.incidentQueueOpen, 'ribbon--tray': showAll || !!query }"
    aria-label="Priority cases"
    data-testid="incident-queue"
  >
    <header class="ribbon__head">
      <h2 class="ribbon__title">
        <span class="num">{{ all.length }}</span> actionable {{ all.length === 1 ? 'case' : 'cases' }}
        <span class="ribbon__scope">· {{ regionName }}</span>
      </h2>
      <button
        v-if="view.incidentQueueOpen"
        type="button"
        class="ribbon__icon"
        :aria-pressed="drilling"
        :aria-label="drilling ? 'Clear map filter' : 'Show these cases on the map'"
        :title="drilling ? 'Clear map filter' : 'Show on map'"
        data-testid="incident-queue-map"
        @click="nav.setKpiDrill(drilling ? null : 'unresolvedIncidents')"
      >
        <Icon name="map" :size="14" />
      </button>
      <button
        type="button"
        class="ribbon__icon"
        :aria-expanded="view.incidentQueueOpen"
        :aria-label="view.incidentQueueOpen ? 'Collapse case ribbon' : 'Expand case ribbon'"
        data-testid="incident-queue-toggle"
        @click="view.incidentQueueOpen = !view.incidentQueueOpen"
      >
        <Icon :name="view.incidentQueueOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
      </button>
    </header>
    <template v-if="view.incidentQueueOpen">
      <div v-if="showAll || query" class="ribbon__tools">
        <label :for="searchId" class="sr-only">Filter cases</label>
        <input :id="searchId" v-model="query" type="search" class="control ribbon__search" placeholder="Filter by vessel, port, ID" data-testid="incident-queue-search" />
      </div>
      <ol class="ribbon__list" aria-label="Cases by priority score">
        <li v-for="(r, i) in rows" :key="r.caseId" class="case" :class="{ 'case--selected': r.caseId === selectedId }">
          <div class="case__row">
            <button type="button" class="case__open" :aria-current="r.caseId === selectedId ? 'true' : undefined" :data-testid="`queue-case-${r.caseId}`" @click="open(r.caseId)">
              <span class="case__rank num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="case__main">
                <strong>{{ r.title }}</strong>
                <span class="case__sub">
                  <StatusChip :status="r.severityStyle" dense />
                  <span class="case__vessel">{{ r.vesselName }} · {{ r.portName }}</span>
                </span>
              </span>
              <span class="case__nums num">
                <span>{{ r.exposureText }}</span>
                <span class="case__age">{{ r.ageText }}</span>
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
              <Icon :name="expanded === r.caseId ? 'chevron-down' : 'info'" :size="13" />
            </button>
          </div>
          <div v-if="expanded === r.caseId" class="case__detail">
            <p class="case__chips">
              <StatusChip :status="r.statusStyle" dense />
              <StatusChip v-if="r.needsVerification" :status="{ tone: 'unknown', label: 'Needs verification', icon: 'question' }" dense />
              <span class="case__owner">{{ r.ownerName ?? 'Unassigned' }}</span>
            </p>
            <p class="case__score">
              Score <strong class="num">{{ r.score }}</strong> · {{ r.caseId }} · severity, exposure, age, stage and confidence. Not a dispatch order.
            </p>
            <ul>
              <li v-for="line in r.rationale" :key="line">{{ line }}</li>
            </ul>
            <p v-if="r.dedupedIds.length" class="case__note">Includes {{ r.dedupedIds.join(', ') }} (same voyage and category within 6 h).</p>
            <p v-if="r.relatedOnVoyage.length" class="case__note">Also on this voyage: {{ r.relatedOnVoyage.join(', ') }}. Exposure is counted once per voyage.</p>
          </div>
        </li>
        <li v-if="!rows.length" class="ribbon__none">No cases match this filter.</li>
      </ol>
      <button v-if="hiddenCount > 0" type="button" class="linkish" data-testid="incident-queue-more" @click="showAll = true">Show all {{ matches.length }} cases</button>
      <button v-else-if="showAll && !query && matches.length > QUEUE_TOP_N" type="button" class="linkish" @click="showAll = false">Show top {{ QUEUE_TOP_N }}</button>
    </template>
  </section>
</template>

<style scoped>
.ribbon {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 6px;
  width: 340px;
  min-height: 0;
  max-height: 100%;
  padding: 8px 10px;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.ribbon--closed {
  grid-template-rows: auto;
  width: auto;
}
.ribbon--tray {
  max-height: min(100%, 520px);
}
.ribbon__head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ribbon__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-13);
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.ribbon__scope {
  font-weight: 400;
  color: var(--color-ink-muted);
}
.ribbon__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
  transition: background var(--motion-hover) var(--ease-standard);
}
.ribbon__icon:hover {
  background: var(--color-panel-secondary);
}
.ribbon__icon[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  color: var(--color-accent-ink);
}
.ribbon__search {
  width: 100%;
  height: 28px;
}
.ribbon__list {
  display: grid;
  align-content: start;
  gap: 2px;
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
  box-shadow: inset 2px 0 0 var(--color-accent);
}
.case__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
}
.case__open {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 4px 5px 6px;
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
.case__main {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.case__main strong {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case__sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.case__vessel,
.case__age,
.case__owner {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case__nums {
  display: grid;
  justify-items: end;
  white-space: nowrap;
  font-weight: 600;
}
.case__why {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-right: 4px;
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
  margin: 0 6px 6px 26px;
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
.case__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 4px;
}
.case__score,
.case__note {
  margin: 0;
}
.case__note {
  margin-top: 4px;
  color: var(--color-ink-secondary);
}
.ribbon__none {
  padding: 8px;
  color: var(--color-ink-muted);
  font-size: var(--text-12);
}
.linkish {
  justify-self: start;
  padding: 0 0 2px;
  border: 0;
  background: none;
  color: var(--color-accent-ink);
  font: inherit;
  font-size: var(--text-12);
  cursor: pointer;
}
.ribbon-empty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  box-shadow: var(--shadow-panel);
}
</style>
