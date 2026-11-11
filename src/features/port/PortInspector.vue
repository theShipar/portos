<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { berthCardView, berthMiniGantt } from '@/selectors/berthGantt';
import { useClockStore } from '@/stores/clock';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { statusStyle } from '@/styles/tokens';
import Icon from '@/components/ui/Icon.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();
const clock = useClockStore();

const card = computed(() => (catalog.catalog && snap.portTwin && view.berthId ? berthCardView(catalog.catalog, snap.portTwin, view.berthId) : null));
const mini = computed(() => (catalog.catalog && snap.portTwin && view.berthId ? berthMiniGantt(catalog.catalog, snap.portTwin, clock.timeMs, view.berthId) : null));
const portName = computed(() => (snap.portTwin ? (catalog.catalog?.byId.port.get(snap.portTwin.portId)?.name ?? snap.portTwin.portId) : ''));
const anchored = computed(() => snap.portView?.kpis.atAnchor ?? null);
const queued = computed(() => snap.portView?.kpis.awaitingBerth ?? null);
const chip = computed(() => (card.value ? statusStyle('berth', card.value.status === 'reserved' ? 'scheduled' : card.value.status) : null));
</script>

<template>
  <aside v-if="card && chip" class="berth-card" aria-label="Port and berth details" data-testid="berth-card" @keydown.esc.stop="view.selectBerth(null)">
    <header class="berth-card__head">
      <div>
        <p class="berth-card__kicker">{{ portName }} · {{ card.terminalName }} · Simulated</p>
        <h2 class="berth-card__title" data-testid="berth-card-title">{{ card.name }}</h2>
      </div>
      <button type="button" class="berth-card__close" aria-label="Close berth details" data-testid="berth-card-close" @click="view.selectBerth(null)">
        <Icon name="close" :size="14" />
      </button>
    </header>
    <div class="port-strip" data-testid="port-inspector-strip">
      <StatusChip :status="chip" :label="card.statusLabel" dense />
      <span v-if="anchored !== null" class="port-strip__stat" data-testid="port-anchored"><strong class="num">{{ anchored }}</strong> at anchor</span>
      <span v-if="queued !== null" class="port-strip__stat"><strong class="num">{{ queued }}</strong> in queue</span>
    </div>
    <section v-if="mini" class="mini" aria-label="Berth schedule, next 24 hours" data-testid="berth-mini-gantt">
      <div v-for="lane in mini.lanes" :key="lane.kind" class="mini__lane" :data-kind="lane.kind">
        <span class="mini__label">{{ lane.label }}</span>
        <div class="mini__track">
          <span v-for="b in lane.bars" :key="b.key" class="mini__bar" :class="[`mini__bar--${b.kind}`, { 'mini__bar--open': b.open }]" :style="{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }" :title="b.title" />
          <span v-for="m in lane.kind === 'planned' ? mini.requested : []" :key="m.key" class="mini__req" :style="{ left: `${m.leftPct}%` }" :title="m.title" />
          <span v-for="x in lane.kind === 'forecast' ? mini.conflicts : []" :key="x.key" class="mini__conflict" :style="{ left: `${x.leftPct}%`, width: `${x.widthPct}%` }" :title="x.title" />
          <span class="mini__now" :style="{ left: `${mini.nowPct}%` }" aria-hidden="true" />
        </div>
      </div>
      <div class="mini__ticks" aria-hidden="true">
        <span v-for="t in mini.ticks" :key="t.key" :style="{ left: `${t.leftPct}%` }">{{ t.label }}</span>
      </div>
    </section>
    <dl class="berth-card__list">
      <template v-if="card.occupant">
        <dt>Alongside</dt>
        <dd>
          <button type="button" class="linkish" data-testid="berth-card-occupant" @click="nav.openEntity({ kind: 'vessel', id: card.occupant.vesselId })">{{ card.occupant.name }}</button>
          <span v-if="card.occupant.sinceUtc" class="berth-card__muted"> since {{ card.occupant.sinceUtc }}</span>
          <span v-if="card.occupant.overdue" class="berth-card__warn"> · departure overdue</span>
        </dd>
      </template>
      <template v-if="card.next">
        <dt>Next</dt>
        <dd>
          <button type="button" class="linkish" @click="nav.openEntity({ kind: 'vessel', id: card.next.vesselId })">{{ card.next.name }}</button>
          <span class="berth-card__muted"> {{ card.next.basisLabel }} {{ card.next.atUtc }}</span>
        </dd>
      </template>
      <template v-for="f in card.facts" :key="f.label">
        <dt>{{ f.label }}</dt>
        <dd class="num">{{ f.value }}</dd>
      </template>
    </dl>
    <section v-if="card.conflicts.length" class="berth-card__conflicts" aria-label="Schedule overlaps" data-testid="berth-card-conflicts">
      <p class="berth-card__flag">Overlap · not yet validated</p>
      <ul>
        <li v-for="x in card.conflicts" :key="x.key">{{ x.text }}</li>
      </ul>
    </section>
    <p class="berth-card__note">{{ card.note }} Illustrative terminal configuration.</p>
  </aside>
</template>

<style scoped>
.berth-card {
  position: absolute;
  z-index: 19;
  top: var(--map-control-gap);
  right: calc(var(--map-control-gap) + var(--card-right, 0px));
  display: grid;
  gap: 8px;
  width: 300px;
  padding: 12px;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
}
.berth-card__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 8px;
}
.berth-card__kicker {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.berth-card__title {
  margin: 0;
  font-size: var(--text-14);
  line-height: 20px;
}
.berth-card__close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.berth-card__list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin: 0;
}
.berth-card__list dt {
  color: var(--color-ink-muted);
}
.berth-card__list dd {
  margin: 0;
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
.linkish:hover {
  text-decoration: underline;
}
.berth-card__muted {
  color: var(--color-ink-muted);
}
.berth-card__warn {
  color: var(--color-warning-ink);
  font-weight: 600;
}
.berth-card__conflicts {
  padding: 8px;
  border-radius: var(--radius-input);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 45%, transparent);
}
.berth-card__flag {
  margin: 0 0 4px;
  color: var(--color-warning-ink);
  font-weight: 600;
}
.berth-card__conflicts ul {
  margin: 0;
  padding-left: 16px;
}
.port-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.port-strip__stat {
  color: var(--color-ink-secondary);
}
.port-strip__stat strong {
  color: var(--color-ink);
}
.mini {
  display: grid;
  gap: 3px;
}
.mini__lane {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 6px;
}
.mini__label {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.mini__track {
  position: relative;
  height: 12px;
  border-radius: 2px;
  background: var(--color-panel-secondary);
  overflow: hidden;
}
.mini__bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 2px;
}
.mini__bar--actual {
  background: var(--color-data-observed);
}
.mini__bar--planned {
  background: transparent;
  border: 1px dashed var(--color-data-planned);
}
.mini__bar--forecast {
  background: repeating-linear-gradient(135deg, var(--color-data-uncertain) 0 3px, transparent 3px 5px);
}
.mini__req {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-data-planned);
}
.mini__conflict {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--color-critical) 22%, transparent);
}
.mini__now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 2px solid var(--color-accent);
}
.mini__ticks {
  position: relative;
  height: 12px;
  margin-left: 62px;
  font-size: 10px;
  color: var(--color-ink-muted);
}
.mini__ticks span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}
.berth-card__note {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
</style>
