<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { berthCardView } from '@/selectors/berthGantt';
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

const card = computed(() => (catalog.catalog && snap.portTwin && view.berthId ? berthCardView(catalog.catalog, snap.portTwin, view.berthId) : null));
const chip = computed(() => (card.value ? statusStyle('berth', card.value.status === 'reserved' ? 'scheduled' : card.value.status) : null));
</script>

<template>
  <aside v-if="card && chip" class="berth-card" aria-label="Berth details" data-testid="berth-card" @keydown.esc.stop="view.selectBerth(null)">
    <header class="berth-card__head">
      <div>
        <p class="berth-card__kicker">Berth · {{ card.terminalName }} · Simulated</p>
        <h2 class="berth-card__title" data-testid="berth-card-title">{{ card.name }}</h2>
      </div>
      <button type="button" class="berth-card__close" aria-label="Close berth details" data-testid="berth-card-close" @click="view.selectBerth(null)">
        <Icon name="close" :size="14" />
      </button>
    </header>
    <StatusChip :status="chip" :label="card.statusLabel" />
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
  background: var(--color-panel);
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
  color: #8a5a0c;
  font-weight: 600;
}
.berth-card__conflicts {
  padding: 8px;
  border-radius: var(--radius-input);
  background: rgba(212, 154, 46, 0.12);
  border: 1px solid rgba(182, 123, 23, 0.45);
}
.berth-card__flag {
  margin: 0 0 4px;
  color: #7a4f09;
  font-weight: 600;
}
.berth-card__conflicts ul {
  margin: 0;
  padding-left: 16px;
}
.berth-card__note {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
</style>
