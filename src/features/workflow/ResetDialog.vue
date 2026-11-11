<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { toIsoUtc } from '@/core/time';
import { downloadJson } from '@/core/download';
import { useNavigation } from '@/router/useRouteSync';
import { useAssumptionStore } from '@/stores/assumptions';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSessionStore } from '@/stores/session';
import { useViewStore } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import { exportAudit } from '@/workflows/handoff';
import Icon from '@/components/ui/Icon.vue';

type Level = 'view' | 'decisions' | 'full';

const view = useViewStore();
const clock = useClockStore();
const wf = useWorkflowStore();
const assumptions = useAssumptionStore();
const session = useSessionStore();
const notices = useNoticeStore();
const nav = useNavigation();
const ids = { title: useId(), desc: useId() };

const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const level = ref<Level>('view');

const decisionCounts = computed(() => {
  const s = wf.state;
  const rates = Object.keys(assumptions.dailyRates).length;
  return [
    `${Object.keys(s.incidents).length} local case ${Object.keys(s.incidents).length === 1 ? 'change' : 'changes'} (status, owner, due time, notes)`,
    `${s.tasks.length} ${s.tasks.length === 1 ? 'task' : 'tasks'}`,
    `${s.drafts.length} communication ${s.drafts.length === 1 ? 'draft' : 'drafts'}`,
    `${s.branches.length} decision ${s.branches.length === 1 ? 'branch' : 'branches'}`,
    `${s.audit.length} audit ${s.audit.length === 1 ? 'event' : 'events'}`,
    `${rates} edited daily delay ${rates === 1 ? 'rate' : 'rates'} (back to fixture values)`,
  ];
});
const VIEW_ITEMS = ['Selection and open inspector', 'Map scope (back to Earth view) and 3D/2D mode', 'Layer switches (back to defaults)', 'KPI map filter', 'Replay time (back to Now, simulated)'];

const options = computed<{ id: Level; label: string; hint: string; clears: string[] }[]>(() => [
  { id: 'view', label: 'Reset view', hint: 'Keeps every decision.', clears: VIEW_ITEMS },
  { id: 'decisions', label: 'Reset decisions', hint: 'Keeps the current view.', clears: decisionCounts.value },
  { id: 'full', label: 'Reset full demo', hint: 'Everything returns to first-load state.', clears: [...VIEW_ITEMS, ...decisionCounts.value, 'Demo identity (back to Taylor Cruz, dispatcher) and motion preference'] },
]);
const current = computed(() => options.value.find((o) => o.id === level.value)!);
const losesAudit = computed(() => level.value !== 'view' && wf.state.audit.length > 0);

function show() {
  level.value = 'view';
  clock.pause();
  dialog.value?.showModal();
  nextTick(() => dialog.value?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus());
}
function close() {
  dialog.value?.close();
}
function onClose() {
  trigger.value?.focus();
}
function exportFirst() {
  const now = toIsoUtc(Date.now());
  downloadJson(`portos-audit-${now.slice(0, 10)}.json`, exportAudit(wf.state, now));
}

function resetView() {
  view.resetView();
  clock.reset();
  nav.home();
}
function resetDecisions() {
  wf.reset();
  assumptions.resetAll();
}

function confirm() {
  const l = level.value;
  if (l === 'view' || l === 'full') resetView();
  if (l === 'decisions' || l === 'full') resetDecisions();
  if (l === 'full') session.resetPreferences();
  close();
  notices.push(l === 'view' ? 'View reset. Decisions are unchanged.' : l === 'decisions' ? 'Local decisions cleared. Fixture data is unchanged.' : 'Demo reset to first-load state.', 'success');
}
</script>

<template>
  <button ref="trigger" type="button" class="btn btn--sm btn--ghost" data-testid="reset-open" @click="show">
    <Icon name="reset" :size="14" />
    <span class="compact-label">Reset</span>
  </button>
  <dialog ref="dialog" class="dlg" :aria-labelledby="ids.title" :aria-describedby="ids.desc" data-testid="reset-dialog" @close="onClose" @keydown.esc.stop>
    <form method="dialog" class="dlg__body" @submit.prevent="confirm">
      <h2 :id="ids.title" class="dlg__title">Reset the demo</h2>
      <p :id="ids.desc" class="dlg__desc">Choose what to clear. The simulated dataset itself never changes.</p>
      <fieldset class="dlg__options">
        <legend class="sr-only">Reset level</legend>
        <label v-for="o in options" :key="o.id" class="opt" :class="{ 'opt--on': level === o.id }">
          <input v-model="level" type="radio" name="reset-level" :value="o.id" :data-testid="`reset-${o.id}`" />
          <span>
            <strong>{{ o.label }}</strong>
            <span class="opt__hint">{{ o.hint }}</span>
          </span>
        </label>
      </fieldset>
      <section class="dlg__clears" aria-live="polite">
        <h3>This clears</h3>
        <ul data-testid="reset-clears">
          <li v-for="c in current.clears" :key="c">{{ c }}</li>
        </ul>
      </section>
      <p v-if="losesAudit" class="dlg__warn">
        The local audit trail will be deleted.
        <button type="button" class="linkish" data-testid="reset-export" @click="exportFirst">Export audit JSON first</button>
      </p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--sm" @click="close">Cancel</button>
        <button type="submit" class="btn btn--sm btn--danger" data-testid="reset-confirm">{{ current.label }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(480px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--surface-popover);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  color: var(--color-ink);
  box-shadow: var(--shadow-panel);
}
.dlg::backdrop {
  background: color-mix(in srgb, var(--map-scrim) 45%, transparent);
}
.dlg__body {
  display: grid;
  gap: 12px;
  padding: 20px;
}
.dlg__title {
  margin: 0;
  font-size: var(--text-16);
  line-height: 24px;
}
.dlg__desc {
  margin: -8px 0 0;
  font-size: var(--text-13);
  color: var(--color-ink-secondary);
}
.dlg__options {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}
.opt {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-13);
  cursor: pointer;
}
.opt--on {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
}
.opt input {
  margin-top: 3px;
}
.opt strong {
  display: block;
  font-weight: 600;
}
.opt__hint {
  font-size: var(--text-12);
  color: var(--color-ink-muted);
}
.dlg__clears {
  padding: 10px 12px;
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
  font-size: var(--text-12);
  line-height: 18px;
}
.dlg__clears h3 {
  margin: 0 0 4px;
  font-size: var(--text-12);
  font-weight: 600;
}
.dlg__clears ul {
  margin: 0;
  padding-left: 18px;
}
.dlg__warn {
  margin: 0;
  font-size: var(--text-12);
  color: var(--color-warning-ink);
}
.dlg__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn--danger {
  background: var(--color-critical);
  border-color: var(--color-critical);
  color: var(--color-on-critical);
}
.btn--danger:hover:not(:disabled) {
  background: var(--color-critical);
  filter: brightness(0.92);
}
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-ink);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
