<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { formatCount } from '@/core/format';
import type { Kpi, KpiKey } from '@/engines/kpis';
import { buildDrillRows } from '@/selectors/kpiDrill';
import { DEFAULT_RAIL_KEYS, kpiRailCells, kpiValueText as value } from '@/selectors/kpiRail';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';
import ProvenanceDetails from '@/components/ui/ProvenanceDetails.vue';

const props = withDefaults(defineProps<{ kpis: Kpi[]; keys?: KpiKey[] }>(), {
  keys: () => DEFAULT_RAIL_KEYS,
});

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();

const cells = computed(() => kpiRailCells(props.kpis, props.keys));
const more = computed(() => props.kpis.filter((k) => !cells.value.some((c) => c.key === k.key)));
const openKey = ref<KpiKey | 'more' | null>(null);
const openKpi = computed(() => (openKey.value && openKey.value !== 'more' ? props.kpis.find((k) => k.key === openKey.value) ?? null : null));
const drill = computed(() => (openKpi.value && catalog.catalog && snap.snapshot ? buildDrillRows(catalog.catalog, snap.snapshot, openKpi.value) : null));
const wrap = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;

async function toggle(key: KpiKey | 'more', e?: Event) {
  if (openKey.value === key) return close();
  opener = (e?.currentTarget as HTMLElement | null) ?? opener;
  openKey.value = key;
  await nextTick();
  panel.value?.focus();
}

function close(returnFocus = true) {
  openKey.value = null;
  if (returnFocus) opener?.focus();
}

function onDocPointer(e: PointerEvent) {
  if (openKey.value && wrap.value && !wrap.value.contains(e.target as Node)) close(false);
}

watch(openKey, (k) => {
  if (k) document.addEventListener('pointerdown', onDocPointer, true);
  else document.removeEventListener('pointerdown', onDocPointer, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true));

function toggleDrill(k: Kpi) {
  nav.setKpiDrill(view.kpiDrill === k.key ? null : k.key);
}
</script>

<template>
  <div ref="wrap" class="kpi-wrap">
    <ul class="kpis" :aria-label="`Key indicators at the simulation time · ${kpis[0]?.cohort ?? ''} · Simulated`" data-testid="map-kpi-rail">
      <li v-for="k in cells" :key="k.key">
        <button
          type="button"
          class="kpi"
          :class="{ 'kpi--open': openKey === k.key, 'kpi--drill': view.kpiDrill === k.key }"
          :aria-expanded="openKey === k.key"
          :aria-label="k.ariaLabel"
          :data-testid="`kpi-${k.key}`"
          @click="toggle(k.key as KpiKey, $event)"
        >
          <span class="kpi__label">{{ k.label }}<Icon v-if="view.kpiDrill === k.key" name="map" :size="11" /></span>
          <span class="kpi__line">
            <span class="kpi__value num">{{ k.valueText }}</span>
            <span v-if="k.contextText" class="kpi__den">{{ k.contextText }}</span>
          </span>
        </button>
      </li>
      <li v-if="more.length" class="kpis__more">
        <button
          type="button"
          class="kpi-more"
          :class="{ 'kpi--open': openKey === 'more' }"
          :aria-expanded="openKey === 'more'"
          :aria-label="`More metrics (${more.length})`"
          :title="`More metrics (${more.length})`"
          data-testid="kpi-more"
          @click="toggle('more', $event)"
        >
          <Icon name="more" :size="16" />
        </button>
      </li>
    </ul>

    <div v-if="snap.activeDrill && !openKey" class="drill-chip" role="status" data-testid="kpi-drill-chip">
      <Icon name="map" :size="13" />
      <span>Map shows {{ formatCount(snap.activeDrill.members.length) }} · {{ snap.activeDrill.label }}</span>
      <button type="button" class="drill-chip__clear" @click="nav.setKpiDrill(null)">Clear</button>
    </div>

    <section
      v-if="openKpi"
      ref="panel"
      class="kpi-panel panel"
      tabindex="-1"
      role="dialog"
      :aria-label="`${openKpi.label} indicator details`"
      data-testid="kpi-panel"
      @keydown.esc.stop="close()"
    >
      <header class="kpi-panel__head">
        <div>
          <div class="micro-label">{{ openKpi.cohort }}</div>
          <h3 class="kpi-panel__title">{{ openKpi.label }} <span class="num">{{ value(openKpi) }}</span></h3>
        </div>
        <button type="button" class="kpi-panel__close" aria-label="Close indicator details" @click="close()"><Icon name="close" :size="14" /></button>
      </header>
      <p class="kpi-panel__def">{{ openKpi.definition }}</p>
      <ProvenanceDetails :provenance="openKpi.provenance" />
      <div v-if="drill && drill.total" class="kpi-panel__members">
        <div class="kpi-panel__members-head">
          <h4>Members <span class="num">{{ formatCount(drill.total) }}</span></h4>
          <button
            v-if="openKpi.drillFilter"
            type="button"
            class="btn btn--sm"
            :class="{ 'btn--primary': view.kpiDrill === openKpi.key }"
            :aria-pressed="view.kpiDrill === openKpi.key"
            data-testid="kpi-drill-toggle"
            @click="toggleDrill(openKpi)"
          >
            {{ view.kpiDrill === openKpi.key ? 'Showing on map' : 'Show only these on map' }}
          </button>
        </div>
        <ul class="kpi-panel__list">
          <li v-for="r in drill.rows" :key="`${r.ref.kind}:${r.ref.id}`">
            <button type="button" class="kpi-row" @click="nav.openEntity(r.ref)">
              <span class="kpi-row__text">
                <span class="kpi-row__title">{{ r.title }}</span>
                <span class="kpi-row__sub mono">{{ r.subtitle }}</span>
              </span>
              <span class="kpi-row__value mono">{{ r.value }}</span>
            </button>
          </li>
        </ul>
        <p v-if="drill.total > drill.rows.length" class="kpi-panel__more">+{{ formatCount(drill.total - drill.rows.length) }} more · use “Show only these on map” to see all</p>
      </div>
      <p v-else-if="drill" class="kpi-panel__more">No members at this time.</p>
    </section>

    <section v-if="openKey === 'more'" ref="panel" class="kpi-panel panel" tabindex="-1" role="dialog" aria-label="More metrics" data-testid="kpi-more-panel" @keydown.esc.stop="close()">
      <header class="kpi-panel__head">
        <h3 class="kpi-panel__title">More metrics</h3>
        <button type="button" class="kpi-panel__close" aria-label="Close metrics" @click="close()"><Icon name="close" :size="14" /></button>
      </header>
      <ul class="kpi-panel__list">
        <li v-for="k in more" :key="k.key">
          <button type="button" class="kpi-row" :data-testid="`kpi-${k.key}`" @click="toggle(k.key)">
            <span class="kpi-row__text">
              <span class="kpi-row__title">{{ k.label }}</span>
              <span class="kpi-row__sub">{{ k.definition }}</span>
            </span>
            <span class="kpi-row__value num">{{ value(k) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.kpi-wrap {
  position: relative;
  display: grid;
  justify-items: start;
  gap: 6px;
}
.kpis {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}
.kpis li + li {
  border-left: 1px solid var(--color-border);
}
.kpi {
  display: grid;
  gap: 1px;
  padding: 7px 14px 8px;
  min-width: 92px;
  height: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background var(--motion-hover) var(--ease-standard);
}
.kpi:hover {
  background: var(--color-panel-secondary);
}
.kpi--open {
  background: var(--color-accent-subtle);
}
.kpi--drill {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.kpi__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-11);
  line-height: 14px;
  font-weight: 500;
  color: var(--color-ink-muted);
}
.kpi__line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}
.kpi__value {
  font-size: var(--text-20);
  line-height: 26px;
  font-weight: 600;
}
.kpi__den {
  font-size: var(--text-11);
  font-weight: 400;
  color: var(--color-ink-muted);
}
.kpis__more {
  display: grid;
}
.kpi-more {
  display: grid;
  place-items: center;
  width: 40px;
  border: 0;
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.kpi-more:hover {
  background: var(--color-panel-secondary);
}
.drill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: var(--radius-chip);
  background: var(--color-accent-fill);
  color: #fff;
  font-size: var(--text-12);
  font-weight: 500;
  box-shadow: var(--shadow-panel);
}
.drill-chip__clear {
  height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-chip);
  background: rgba(255, 255, 255, 0.18);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.drill-chip__clear:hover {
  background: rgba(255, 255, 255, 0.3);
}
.kpi-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 30;
  width: 380px;
  max-height: calc(100vh - 220px);
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 12px 14px 14px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.kpi-panel:focus {
  outline: none;
}
.kpi-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.kpi-panel__title {
  margin: 0;
  font-size: var(--text-16);
  line-height: 22px;
  font-weight: 600;
}
.kpi-panel__title .num {
  margin-left: 6px;
}
.kpi-panel__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--color-ink-muted);
  cursor: pointer;
}
.kpi-panel__close:hover {
  background: var(--color-panel-secondary);
}
.kpi-panel__def {
  margin: 0;
  font-size: var(--text-12);
  line-height: 18px;
  color: var(--color-ink);
}
.kpi-panel__members {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
.kpi-panel__members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.kpi-panel__members-head h4 {
  margin: 0;
  font-size: var(--text-12);
  font-weight: 600;
}
.kpi-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.kpi-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.kpi-row:hover {
  background: var(--color-panel-secondary);
}
.kpi-row__text {
  flex: 1;
  display: grid;
  min-width: 0;
}
.kpi-row__title {
  font-size: var(--text-12);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi-row__sub {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi-row__value {
  font-size: var(--text-12);
  font-weight: 600;
  white-space: nowrap;
}
.kpi-panel__more {
  margin: 0;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>
