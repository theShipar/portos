<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentCardView, TerminalOpsView } from '@/selectors/terminalOps';
import { useNavigation } from '@/router/useRouteSync';
import { useViewStore } from '@/stores/view';

const props = defineProps<{ ops: TerminalOpsView; card: EquipmentCardView | null }>();
const view = useViewStore();
const nav = useNavigation();

const TONE: Record<string, string> = { transferring: 'run', paused: 'hold', hazard: 'warn', maintenance: 'warn', moored: 'hold', idle: 'idle' };
const tone = (status: string) => TONE[status] ?? 'idle';
const phaseTone = computed(() => (props.ops.operation ? tone(props.ops.operation.phase === 'complete' || props.ops.operation.phase === 'scheduled' ? 'idle' : props.ops.operation.phase) : 'idle'));

function toggle(id: string) {
  void nav.setEquipment(view.equipmentId === id ? null : id);
}

/** Arrow keys move between equipment rows (one tab stop for the list). */
function onListKey(e: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button[data-equipment]')];
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
  rows[next]?.focus();
  e.preventDefault();
}
</script>

<template>
  <section class="tops" :aria-label="`${ops.name} operations`" data-testid="terminal-ops" :data-terminal-type="ops.type">
    <div class="tops__head">
      <span class="tops__type" data-testid="terminal-type-chip">{{ ops.typeLabel }}</span>
      <span class="tops__name">{{ ops.name }}</span>
    </div>
    <p v-if="ops.empty" class="tops__empty" data-testid="terminal-ops-empty">{{ ops.empty }}</p>
    <template v-if="ops.operation">
      <div class="tops__op">
        <span class="tops__dot" :data-tone="phaseTone" aria-hidden="true" />
        <span class="tops__phase" data-testid="terminal-ops-phase">{{ ops.operation.phaseLabel }}</span>
        <span class="tops__muted">· {{ ops.operation.direction }} {{ ops.operation.commodity }}</span>
      </div>
      <p v-if="ops.operation.note" class="tops__note" data-testid="terminal-ops-note">{{ ops.operation.note }}</p>
      <p class="tops__muted">
        <button type="button" class="linkish" @click="nav.openEntity({ kind: 'vessel', id: ops.operation.vesselId })">{{ ops.operation.vesselName }}</button>
        at {{ ops.operation.berthName }}
      </p>
      <div class="tops__progress" role="progressbar" :aria-valuenow="Math.round(ops.operation.progressPct)" aria-valuemin="0" aria-valuemax="100" aria-label="Cargo work progress">
        <span :style="{ width: `${ops.operation.progressPct}%` }" />
      </div>
    </template>
    <dl v-if="ops.kpis.length" class="tops__kpis" data-testid="terminal-ops-kpis">
      <template v-for="k in ops.kpis" :key="k.key">
        <dt>{{ k.label }}</dt>
        <dd class="num" :data-testid="`terminal-kpi-${k.key}`">{{ k.value }}<span v-if="k.detail" class="tops__muted"> · {{ k.detail }}</span></dd>
      </template>
    </dl>
    <div v-for="group in [{ label: ops.shipLabel, bars: ops.ship, key: 'ship' }, { label: 'Shore stores', bars: ops.shore, key: 'shore' }]" :key="group.key" class="tops__bars">
      <template v-if="group.bars.length">
        <p class="tops__label">{{ group.label }}</p>
        <div v-for="b in group.bars" :key="b.id" class="tops__bar" :data-testid="`store-${b.id}`">
          <span class="tops__bar-label">{{ b.label }}</span>
          <span class="tops__track"><span :style="{ width: `${b.pct}%` }" /></span>
          <span class="tops__bar-text num">{{ b.text }}</span>
        </div>
      </template>
    </div>
    <label v-if="ops.hazard" class="tops__hazard" :data-active="ops.hazard.active" data-testid="hazard-toggle">
      <input v-model="view.twinHazard" type="checkbox" />
      <span>{{ ops.hazard.label }} · {{ ops.hazard.radiusM }} m</span>
      <strong v-if="ops.hazard.active">Hazard check active</strong>
    </label>
    <div v-if="ops.equipment.length" class="tops__equip" role="group" aria-label="Terminal equipment" data-testid="equipment-list" @keydown="onListKey">
      <p class="tops__label">Equipment</p>
      <button
        v-for="e in ops.equipment"
        :key="e.equipmentId"
        type="button"
        class="tops__row"
        :class="{ 'tops__row--on': view.equipmentId === e.equipmentId }"
        :aria-pressed="view.equipmentId === e.equipmentId"
        :data-equipment="e.equipmentId"
        :data-testid="`equip-row-${e.equipmentId}`"
        @click="toggle(e.equipmentId)"
      >
        <span class="tops__dot" :data-tone="tone(e.status)" aria-hidden="true" />
        <span class="tops__row-label">{{ e.label }}</span>
        <span class="tops__muted">{{ e.statusLabel }}</span>
      </button>
    </div>
    <section v-if="card" class="tops__card" :aria-label="`${card.label} details`" data-testid="equipment-card">
      <header class="tops__card-head">
        <strong data-testid="equipment-card-title">{{ card.label }}</strong>
        <span class="tops__muted">{{ card.kindLabel }} · {{ card.statusLabel }}</span>
      </header>
      <p v-if="card.note" class="tops__note">{{ card.note }}</p>
      <dl class="tops__kpis">
        <template v-for="f in card.facts" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd class="num">{{ f.value }}</dd>
        </template>
        <template v-if="card.vessel">
          <dt>Vessel</dt>
          <dd><button type="button" class="linkish" @click="nav.openEntity({ kind: 'vessel', id: card.vessel.vesselId })">{{ card.vessel.name }}</button></dd>
        </template>
      </dl>
      <p class="tops__basis">{{ card.source }}</p>
    </section>
    <p class="tops__basis" data-testid="terminal-ops-basis">{{ ops.basis }} · illustrative equipment, not a terminal control record</p>
  </section>
</template>

<style scoped>
.tops {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
.tops__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tops__type {
  padding: 1px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
  font-size: var(--text-11);
  font-weight: 600;
}
.tops__name {
  color: var(--color-ink-secondary);
}
.tops__op {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tops__phase {
  font-weight: 600;
}
.tops__muted,
.tops__empty {
  margin: 0;
  color: var(--color-ink-muted);
}
.tops__note {
  margin: 0;
  color: var(--color-warning-ink);
}
.tops__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-ink-muted);
}
.tops__dot[data-tone='run'] {
  background: var(--color-accent);
}
.tops__dot[data-tone='hold'] {
  background: var(--color-data-planned);
}
.tops__dot[data-tone='warn'] {
  background: var(--color-warning);
}
.tops__progress,
.tops__track {
  position: relative;
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--color-panel-secondary);
  overflow: hidden;
}
.tops__progress span,
.tops__track span {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-accent);
}
.tops__kpis {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  margin: 0;
}
.tops__kpis dt {
  color: var(--color-ink-muted);
}
.tops__kpis dd {
  margin: 0;
}
.tops__label {
  margin: 2px 0 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tops__bars {
  display: grid;
  gap: 3px;
}
.tops__bar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
}
.tops__bar-label {
  color: var(--color-ink-secondary);
}
.tops__bar-text {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.tops__hazard {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.tops__hazard[data-active='true'] strong {
  color: var(--color-warning-ink);
}
.tops__equip {
  display: grid;
  gap: 2px;
}
.tops__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  background: none;
  color: var(--color-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tops__row:hover {
  background: var(--color-panel-secondary);
}
.tops__row--on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.tops__row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.tops__card {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
}
.tops__card-head {
  display: grid;
}
.tops__basis {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-ink);
  font: inherit;
  cursor: pointer;
}
.linkish:hover {
  text-decoration: underline;
}
</style>
