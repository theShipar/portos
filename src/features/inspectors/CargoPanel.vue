<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StowagePlan } from '@/core/cargoTypes';
import { CARGO_DISCLOSURE, type BaySection, type CargoSummaryModel, type CompartmentDetailModel, type SlotDetailModel } from '@/selectors/vesselCargo';
import { CARGO_SWATCHES } from '@/spatial/scenes/VesselWorkshopScene';
import DetailCard from '@/components/ui/DetailCard.vue';
import FieldList from '@/components/ui/FieldList.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

/** Cargo summary, bay/row/tier (or hold) picker and the manifest card of the focused slot (V3 spec 04/04, 05). */
const props = defineProps<{
  summary: CargoSummaryModel;
  plan: StowagePlan;
  section: BaySection | null;
  bay: number | null;
  hold: number | null;
  focus: string | null;
  detail: SlotDetailModel | CompartmentDetailModel | null;
}>();
const emit = defineEmits<{ focus: [string | null]; hold: [number | null]; bay: [number] }>();

const swatch = (i: number | null) => (i === null ? 'transparent' : CARGO_SWATCHES[i % CARGO_SWATCHES.length]);
const holdOptions = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const pad = (n: number) => String(n).padStart(2, '0');

// Roving focus (ARIA grid): the bay section is one tab stop; arrow keys, Home and End move between cells.
const grid = ref<HTMLElement | null>(null);
const cursor = ref<string | null>(null);
const matrix = computed(() => props.section?.lines.map((l) => l.cells.map((c) => c.slotId)) ?? []);
const tabStop = computed(() => {
  const ids = matrix.value.flat();
  for (const id of [cursor.value, props.focus]) if (id && ids.includes(id)) return id;
  return ids[0] ?? null;
});
function onGridKey(e: KeyboardEvent, li: number, ci: number) {
  const m = matrix.value;
  const step: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  let r = li;
  let c = ci;
  if (e.key in step) {
    r = Math.min(m.length - 1, Math.max(0, li + step[e.key]![0]));
    c = Math.min((m[r]?.length ?? 1) - 1, Math.max(0, ci + step[e.key]![1]));
  } else if (e.key === 'Home') c = 0;
  else if (e.key === 'End') c = (m[r]?.length ?? 1) - 1;
  else return;
  e.preventDefault();
  const id = m[r]?.[c];
  if (!id) return;
  cursor.value = id;
  grid.value?.querySelector<HTMLElement>(`[data-testid="slot-${id}"]`)?.focus();
}
</script>

<template>
  <section class="cargo" data-testid="cargo-summary" :data-archetype="summary.archetype">
    <h3 class="section-title">{{ summary.title }} <span class="section-note">{{ summary.asOfText }}</span></h3>
    <dl class="cargo__head">
      <div v-for="h in summary.headline" :key="h.label">
        <dt>{{ h.label }}</dt>
        <dd class="num" :data-testid="`cargo-head-${h.label.toLowerCase().replace(/\s+/g, '-')}`">{{ h.value }}</dd>
      </div>
    </dl>
    <ul v-if="summary.kind === 'slots'" class="cargo__dest" aria-label="Containers by discharge port">
      <li v-for="d in summary.destinations" :key="d.portId" :data-testid="`cargo-dest-${d.portId}`">
        <span class="cargo__swatch" :style="{ background: swatch(d.swatch) }" aria-hidden="true" />
        <span class="cargo__dest-name">{{ d.name }}</span>
        <span class="cargo__bar" aria-hidden="true"><span :style="{ width: d.shareWidth, background: swatch(d.swatch) }" /></span>
        <span class="num cargo__dest-count">{{ d.countText }}</span>
      </li>
    </ul>
    <p v-if="summary.notes.length" class="cargo__notes">{{ summary.notes.join(' · ') }}</p>
    <div v-if="summary.nextMoves.length" class="cargo__moves" data-testid="cargo-next-moves">
      <span class="micro-label">Next crane moves (EST)</span>
      <ul>
        <li v-for="m in summary.nextMoves" :key="m.id"><span class="mono">{{ m.timeText }}</span> {{ m.text }}</li>
      </ul>
    </div>
    <p v-if="summary.craneText" class="cargo__notes" data-testid="cargo-crane-plan">{{ summary.craneText }}</p>
  </section>

  <section class="cargo" data-testid="cargo-picker">
    <h3 class="section-title">
      {{ summary.kind === 'slots' ? 'Slot detail' : 'Compartments' }}
      <span class="section-note">{{ summary.kind === 'slots' ? 'pick a bay, row and tier' : 'pick a hold, tank or deck' }}</span>
    </h3>

    <template v-if="summary.kind === 'slots' && plan.grid">
      <div class="cargo__pickers">
        <label>
          <span class="micro-label">Hold</span>
          <select data-testid="cargo-hold" :value="hold ?? ''" @change="emit('hold', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)">
            <option value="">All holds</option>
            <option v-for="h in holdOptions(summary.holdCount)" :key="h" :value="h">Hold {{ h }}</option>
          </select>
        </label>
        <label>
          <span class="micro-label">Bay</span>
          <select data-testid="cargo-bay" :value="bay ?? ''" @change="emit('bay', Number(($event.target as HTMLSelectElement).value))">
            <option v-for="b in plan.grid.bays" :key="b" :value="b">Bay {{ pad(b) }}</option>
          </select>
        </label>
      </div>
      <div v-if="section" ref="grid" class="bay" :style="{ '--rows': section.rows.length }" role="grid" :aria-label="section.ariaLabel" data-testid="cargo-bay-grid">
        <div class="bay__head" role="row">
          <span class="bay__tier" />
          <span v-for="r in section.rows" :key="r" class="bay__row num" role="columnheader">{{ pad(r) }}</span>
        </div>
        <template v-for="(line, li) in section.lines" :key="line.tier">
          <div v-if="line.hatchBefore" class="bay__hatch" aria-hidden="true"><span>hatch cover</span></div>
          <div class="bay__line" role="row">
            <span class="bay__tier num" role="rowheader">{{ line.tierText }}</span>
            <button
              v-for="(cell, ci) in line.cells"
              :key="cell.slotId"
              type="button"
              role="gridcell"
              class="bay__cell"
              :class="{ 'bay__cell--filled': cell.filled, 'bay__cell--sel': focus === cell.slotId, 'bay__cell--restricted': cell.restricted }"
              :style="{ background: swatch(cell.swatch) }"
              :aria-label="cell.label"
              :aria-selected="focus === cell.slotId"
              :data-testid="`slot-${cell.slotId}`"
              :tabindex="cell.slotId === tabStop ? 0 : -1"
              @focus="cursor = cell.slotId"
              @keydown="onGridKey($event, li, ci)"
              @click="emit('focus', cell.slotId)"
            />
          </div>
        </template>
        <div class="bay__legend"><span>Port</span><span>Starboard</span></div>
      </div>
    </template>

    <ul v-else class="cmp" aria-label="Compartments">
      <li v-for="c in summary.compartments" :key="c.compartmentId">
        <button type="button" class="cmp__btn" :class="{ 'cmp__btn--sel': focus === c.compartmentId }" :aria-pressed="focus === c.compartmentId" :data-testid="`compartment-${c.compartmentId}`" @click="emit('focus', focus === c.compartmentId ? null : c.compartmentId)">
          <span class="cmp__label">{{ c.label }}</span>
          <span class="cmp__bar" aria-hidden="true"><span :style="{ width: c.fillWidth }" /></span>
          <span class="num cmp__qty">{{ c.quantityText }} · {{ c.fillText }}</span>
        </button>
      </li>
    </ul>

    <div v-if="detail" class="cargo__detail" data-testid="cargo-detail" :data-focus="focus">
      <p class="cargo__slot mono">{{ detail.label }}<template v-if="detail.kind === 'slot'"> · Hold {{ detail.hold }}</template></p>
      <FieldList v-if="detail.kind === 'compartment'" :fields="detail.fields" />
      <DetailCard v-if="detail.manifest" :title="detail.manifest.title" :eyebrow="detail.manifest.eyebrow" :caption="detail.manifest.caption" selected data-testid="cargo-manifest">
        <template v-if="detail.manifest.chips.length" #status>
          <StatusChip v-for="ch in detail.manifest.chips" :key="ch.label" :status="ch" dense />
        </template>
        <p class="cargo__where" data-testid="cargo-location">{{ detail.manifest.locationText }}</p>
        <p v-if="detail.manifest.nextText" class="cargo__next">Next: {{ detail.manifest.nextText }}</p>
        <FieldList :fields="detail.manifest.fields" />
      </DetailCard>
      <p v-else class="empty" data-testid="cargo-empty-slot">Empty slot at this time.</p>
      <button type="button" class="btn btn--sm" @click="emit('focus', null)">Clear selection</button>
    </div>
    <p class="cargo__disclosure">{{ CARGO_DISCLOSURE }}</p>
  </section>
</template>

<style scoped>
.cargo {
  display: grid;
  gap: 8px;
}
.section-title {
  font-size: var(--text-14);
  line-height: 20px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.section-note {
  font-size: var(--text-11);
  font-weight: 400;
  color: var(--color-ink-muted);
}
.cargo__head {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  margin: 0;
}
.cargo__head dt {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.cargo__head dd {
  margin: 0;
  font-size: var(--text-14);
  font-weight: 600;
}
.cargo__dest,
.cmp {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cargo__dest li {
  display: grid;
  grid-template-columns: 10px minmax(70px, auto) 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: var(--text-12);
}
.cargo__swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.cargo__bar,
.cmp__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-panel-secondary);
  overflow: hidden;
}
.cargo__bar span,
.cmp__bar span {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--color-data-observed);
}
.cargo__dest-count,
.cmp__qty {
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
}
.cargo__notes,
.cargo__disclosure {
  margin: 0;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.cargo__moves ul {
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-12);
}
.cargo__pickers {
  display: flex;
  gap: 8px;
}
.cargo__pickers label {
  display: grid;
  gap: 2px;
  flex: 1;
}
.cargo__pickers select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: inherit;
  font: inherit;
  font-size: var(--text-12);
}
.bay {
  display: grid;
  gap: 2px;
  padding: 8px;
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.bay__head,
.bay__line {
  display: grid;
  grid-template-columns: 22px repeat(var(--rows), 1fr);
  gap: 2px;
  align-items: center;
}
.bay__row,
.bay__tier {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
  text-align: center;
}
.bay__cell {
  height: 16px;
  border: 1px dashed color-mix(in srgb, var(--color-ink-muted) 45%, transparent);
  border-radius: 2px;
  padding: 0;
}
.bay__cell--filled {
  border: 1px solid color-mix(in srgb, var(--color-space) 30%, transparent);
}
.bay__cell--restricted {
  background-image: repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-space) 32%, transparent) 0 2px, transparent 2px 5px) !important;
}
.bay__cell--sel {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.bay__cell:focus-visible {
  outline: 2px solid var(--color-focus, var(--color-accent));
  outline-offset: 1px;
}
.bay__hatch {
  margin: 2px 0 2px 24px;
  border-top: 2px solid var(--color-border-strong, var(--color-border));
  font-size: var(--text-11);
  color: var(--color-ink-muted);
  text-align: center;
}
.bay__hatch span {
  position: relative;
  top: -9px;
  padding: 0 6px;
  background: var(--color-panel-secondary);
}
.bay__legend {
  display: flex;
  justify-content: space-between;
  padding-left: 24px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.cmp__btn {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  font-size: var(--text-12);
  text-align: left;
}
.cmp__btn--sel {
  border-color: var(--color-accent);
}
.cargo__detail {
  display: grid;
  gap: 8px;
}
.cargo__slot {
  margin: 0;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.cargo__where,
.cargo__next {
  margin: 0;
  font-size: var(--text-12);
}
.cargo__next {
  color: var(--color-ink-secondary);
}
.empty {
  padding: 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
</style>
