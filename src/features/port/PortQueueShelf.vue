<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { formatHours, formatLocal, formatUtc } from '@/core/format';
import { parseUtc } from '@/core/time';
import { useNavigation } from '@/router/useRouteSync';
import { filterQueue, QUEUE_STATUS_LABEL, type PortQueueRow, type QueueFilter } from '@/selectors/port';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();
const filter = ref<QueueFilter>('all');

const vm = computed(() => snap.portView);
const PEEK_ROWS = 3;
const allRows = computed(() => (vm.value ? filterQueue(vm.value.queue, filter.value) : []));
const rows = computed(() => (view.queueTrayOpen ? allRows.value : allRows.value.slice(0, PEEK_ROWS)));
const selectedVesselId = computed(() => (view.selection?.kind === 'vessel' ? view.selection.id : null));

const filters = computed<{ id: QueueFilter; label: string; count: number }[]>(() => {
  const q = vm.value?.queue ?? [];
  return [
    { id: 'all', label: 'All', count: q.length },
    { id: 'at_anchor', label: 'At anchor', count: filterQueue(q, 'at_anchor').length },
    { id: 'awaiting_berth', label: 'Not anchored', count: filterQueue(q, 'awaiting_berth').length },
    { id: 'unconfirmed', label: 'Berth unconfirmed', count: filterQueue(q, 'unconfirmed').length },
  ];
});

function berthEta(r: PortQueueRow) {
  if (!r.berthConfirmed || !r.estimatedBerthUtc) return 'Unconfirmed';
  const h = hoursUntil(r.estimatedBerthUtc);
  return h !== null && h >= 0 ? `in ${formatHours(h)}` : formatUtc(r.estimatedBerthUtc);
}

function hoursUntil(iso: string) {
  const t = parseUtc(iso);
  const now = parseUtc(vm.value?.asOfUtc ?? null);
  return t === null || now === null ? null : (t - now) / 3_600_000;
}

function open(id: string) {
  nav.openEntity({ kind: 'vessel', id });
}

const listEl = ref<HTMLElement | null>(null);
watch(
  selectedVesselId,
  (id) => {
    if (!id) return;
    nextTick(() => listEl.value?.querySelector(`[data-testid="queue-row-${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  },
  { immediate: true },
);
</script>

<template>
  <section v-if="vm" class="shelf" :class="{ 'shelf--closed': !view.queueShelfOpen, 'shelf--tray': view.queueTrayOpen }" aria-label="Port queue" data-testid="port-queue">
    <header class="shelf__head">
      <h2 class="shelf__title">
        Berth queue <span class="num">{{ vm.queue.length }}</span>
        <span class="shelf__scope">· {{ vm.port.name }}</span>
      </h2>
      <button v-if="view.queueShelfOpen" type="button" class="shelf__icon" aria-label="Replay this port" title="Replay" data-testid="open-replay" @click="nav.openReplay()">
        <Icon name="clock" :size="14" />
      </button>
      <button
        type="button"
        class="shelf__toggle"
        :aria-expanded="view.queueShelfOpen"
        :aria-label="view.queueShelfOpen ? 'Collapse port queue' : 'Expand port queue'"
        data-testid="queue-toggle"
        @click="view.queueShelfOpen = !view.queueShelfOpen"
      >
        <Icon :name="view.queueShelfOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
      </button>
    </header>
    <template v-if="view.queueShelfOpen">
      <template v-if="view.queueTrayOpen">
      <p class="shelf__time num">
        {{ formatUtc(vm.asOfUtc) }} · <span>{{ formatLocal(vm.asOfUtc, vm.localTimeZone) }} ({{ vm.localTimeZone }})</span>
      </p>
      <div class="shelf__filters" role="group" aria-label="Filter queue">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="fchip"
          :aria-pressed="filter === f.id"
          :data-testid="`queue-filter-${f.id}`"
          @click="filter = f.id"
        >
          {{ f.label }} <span class="num">{{ f.count }}</span>
        </button>
      </div>
      <p class="shelf__meta">
        <span class="num" data-testid="queue-count">{{ rows.length }} of {{ vm.queue.length }} in queue</span>
        <span>Sorted by elapsed wait — not berth priority</span>
      </p>
      </template>
      <ol ref="listEl" class="shelf__list" aria-label="Vessels in berth queue">
        <li v-for="r in rows" :key="r.portCallId">
          <button
            type="button"
            class="qrow"
            :class="{ 'qrow--selected': r.vesselId === selectedVesselId }"
            :aria-current="r.vesselId === selectedVesselId ? 'true' : undefined"
            :data-testid="`queue-row-${r.vesselId}`"
            @click="open(r.vesselId)"
          >
            <span class="qrow__tone" :class="`qrow__tone--${r.tone}`" aria-hidden="true" />
            <span class="qrow__main">
              <strong>{{ r.name }}</strong>
              <span class="qrow__sub">{{ QUEUE_STATUS_LABEL[r.status] }} · {{ r.terminalName ?? 'Terminal unassigned' }}</span>
            </span>
            <span class="qrow__nums num">
              <span :title="r.queueEvidence">{{ r.elapsedWaitHours === null ? 'Wait start unknown' : `${formatHours(r.elapsedWaitHours)} waiting` }}</span>
              <span class="qrow__sub" :class="{ 'qrow__sub--warn': !r.berthConfirmed }" :title="r.estimatedBerthUtc ? `Estimated berth ${formatUtc(r.estimatedBerthUtc)}` : 'No confirmed berth time'">
                Berth {{ berthEta(r) }}
              </span>
            </span>
          </button>
        </li>
        <li v-if="!rows.length" class="shelf__empty">{{ vm.queue.length ? 'No vessels match this filter.' : 'No managed vessels waiting here at the selected time.' }}</li>
      </ol>
      <button v-if="!view.queueTrayOpen && allRows.length > rows.length" type="button" class="linkish shelf__more" data-testid="queue-more" @click="view.queueTrayOpen = true">
        Show all {{ allRows.length }} waiting
      </button>
      <button v-else-if="view.queueTrayOpen" type="button" class="linkish shelf__more" data-testid="queue-less" @click="view.queueTrayOpen = false">Show the three longest waits</button>
      <template v-if="view.queueTrayOpen">
      <details class="shelf__arrivals">
        <summary>
          Arrivals next 24 h <span class="num">{{ vm.arrivals.length }}</span>
        </summary>
        <ul>
          <li v-for="a in vm.arrivals" :key="a.portCallId">
            <button type="button" class="linkish" @click="open(a.vesselId)">{{ a.name }}</button>
            <span class="num">in {{ formatHours(hoursUntil(a.arrivalAtUtc)) }} · {{ a.terminalName ?? '—' }}</span>
          </li>
          <li v-if="!vm.arrivals.length" class="shelf__empty">No scheduled arrivals in the next 24 h.</li>
        </ul>
      </details>
      <p class="shelf__foot">
        <template v-if="vm.berthFeed === 'unavailable'">Berth feed unavailable.</template>
        <template v-else>Median uses {{ vm.kpis.waitSampleSize }} of {{ vm.queue.length }} known waits.</template>
        Synthetic port events.
      </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.shelf {
  display: grid;
  grid-template-rows: auto;
  align-content: start;
  gap: 6px;
  width: 340px;
  min-height: 0;
  max-height: 100%;
  padding: 8px 10px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  pointer-events: auto;
}
.shelf--tray {
  grid-template-rows: auto auto auto auto minmax(0, 1fr) auto auto auto;
  max-height: min(100%, 560px);
}
.shelf--closed {
  width: auto;
}
.shelf__head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.shelf__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-13);
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.shelf__scope {
  font-weight: 400;
  color: var(--color-ink-muted);
}
.shelf__icon,
.shelf__toggle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.shelf__icon:hover,
.shelf__toggle:hover {
  background: var(--color-panel-secondary);
}
.shelf__more {
  justify-self: start;
  font-size: var(--text-12);
}
.shelf__time {
  margin: 0;
  font-size: var(--text-12);
  line-height: 16px;
}
.shelf__time span {
  color: var(--color-ink-muted);
}
.shelf__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.fchip {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-chip);
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  cursor: pointer;
}
.fchip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  color: var(--color-accent-ink);
}
.fchip .num {
  margin-left: 2px;
  font-weight: 600;
}
.shelf__meta {
  display: grid;
  gap: 2px;
  margin: 0;
  font-size: var(--text-11);
  line-height: 14px;
  color: var(--color-ink-muted);
}
.shelf__list {
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 0;
  margin: 0 -4px;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.qrow {
  display: grid;
  grid-template-columns: 4px 1fr auto;
  gap: 8px;
  width: 100%;
  padding: 6px 8px 6px 4px;
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
.qrow:hover {
  background: var(--color-panel-secondary);
}
.qrow--selected {
  background: var(--color-accent-subtle);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}
.qrow__tone {
  border-radius: 2px;
  background: var(--color-border);
}
.qrow__tone--incident {
  background: var(--color-critical);
}
.qrow__tone--atRisk {
  background: var(--color-warning);
}
.qrow__tone--delayed {
  background: #c9a227;
}
.qrow__tone--onPlan {
  background: var(--color-healthy);
}
.qrow__main,
.qrow__nums {
  display: grid;
  min-width: 0;
}
.qrow__main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.qrow__nums {
  justify-items: end;
  white-space: nowrap;
}
.qrow__sub {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qrow__sub--warn {
  color: var(--color-unknown-ink);
}
.shelf__empty {
  padding: 8px;
  color: var(--color-ink-muted);
  font-size: var(--text-12);
}
.shelf__arrivals {
  font-size: var(--text-12);
  line-height: 16px;
}
.shelf__arrivals summary {
  cursor: pointer;
  font-weight: 500;
}
.shelf__arrivals ul {
  display: grid;
  gap: 4px;
  max-height: 140px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.shelf__arrivals li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.shelf__arrivals li .num {
  color: var(--color-ink-muted);
}
.shelf__foot {
  margin: 0;
  font-size: var(--text-11);
  line-height: 14px;
  color: var(--color-ink-muted);
}
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
