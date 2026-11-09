<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { toIsoUtc } from '@/core/time';
import { downloadJson } from '@/core/download';
import { useNavigation } from '@/router/useRouteSync';
import { AUDIT_ACTION_LABEL, auditMatches, auditRows, hubDrafts, hubTasks, type AuditFilter } from '@/selectors/activity';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSessionStore } from '@/stores/session';
import { useWorkflowStore } from '@/stores/workflow';
import { exportAudit, PROTOTYPE_CAVEAT } from '@/workflows/handoff';
import type { AuditActionType } from '@/workflows/types';
import Icon from '@/components/ui/Icon.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

type Tab = 'tasks' | 'drafts' | 'audit';

const catalog = useCatalogStore();
const clock = useClockStore();
const session = useSessionStore();
const wf = useWorkflowStore();
const nav = useNavigation();
const ids = { panel: useId(), region: useId(), actor: useId(), action: useId(), entity: useId() };

const open = ref(false);
const tab = ref<Tab>('tasks');
const mine = ref(false);
const regionId = ref<string | null>(null);
const filter = ref<AuditFilter>({ actorUserId: null, actionType: null, entity: '' });
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const outstanding = computed(() => wf.outstandingTasks.length);
const regions = computed(() => catalog.catalog?.regions ?? []);
const users = computed(() => catalog.catalog?.users ?? []);
const actionTypes = Object.keys(AUDIT_ACTION_LABEL) as AuditActionType[];
const tasks = computed(() => (catalog.catalog ? hubTasks(catalog.catalog, wf.state, clock.timeMs, { mineUserId: mine.value ? (session.user?.userId ?? null) : null, regionId: regionId.value }) : []));
const drafts = computed(() => (catalog.catalog ? hubDrafts(catalog.catalog, wf.state) : []));
const auditEvents = computed(() => wf.state.audit.filter((a) => auditMatches(a, filter.value)).reverse());
const audit = computed(() => (catalog.catalog ? auditRows(catalog.catalog, auditEvents.value) : []));
const filtered = computed(() => filter.value.actorUserId !== null || filter.value.actionType !== null || filter.value.entity.trim() !== '');
const tabs = computed<{ id: Tab; label: string; count: number }[]>(() => [
  { id: 'tasks', label: 'Tasks', count: outstanding.value },
  { id: 'drafts', label: 'Drafts', count: wf.state.drafts.length },
  { id: 'audit', label: 'Audit', count: wf.state.audit.length },
]);

function toggle() {
  open.value = !open.value;
}
function close(returnFocus = true) {
  open.value = false;
  if (returnFocus) trigger.value?.focus();
}
function go(incidentId: string | null) {
  if (!incidentId) return;
  close(false);
  nav.openEntity({ kind: 'incident', id: incidentId });
}
function exportJson() {
  const f = { ...filter.value };
  const now = toIsoUtc(Date.now());
  downloadJson(`portos-audit-${now.slice(0, 10)}.json`, exportAudit(wf.state, now, filtered.value ? (a) => auditMatches(a, f) : undefined));
}
function clearFilter() {
  filter.value = { actorUserId: null, actionType: null, entity: '' };
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
  }
}
function onPointer(e: PointerEvent) {
  const t = e.target as Node;
  if (!panel.value?.contains(t) && !trigger.value?.contains(t)) close(false);
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onPointer, true);
    nextTick(() => panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  } else document.removeEventListener('pointerdown', onPointer, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointer, true));

function onTabKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const order: Tab[] = ['tasks', 'drafts', 'audit'];
  const i = order.indexOf(tab.value);
  tab.value = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
  nextTick(() => panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
}

defineExpose({ openTab: (t: Tab) => ((tab.value = t), (open.value = true)) });
</script>

<template>
  <div class="hub">
    <button
      ref="trigger"
      type="button"
      class="hub__trigger"
      :aria-expanded="open"
      :aria-controls="ids.panel"
      data-testid="activity-hub"
      @click="toggle"
    >
      <Icon name="check" :size="16" />
      <span>Activity</span>
      <span v-if="outstanding" class="hub__badge num" data-testid="activity-count" :aria-label="`${outstanding} outstanding tasks`">{{ outstanding }}</span>
      <span v-if="!wf.saved" class="hub__unsaved" data-testid="not-saved">Not saved</span>
    </button>
    <section v-if="open" :id="ids.panel" ref="panel" class="hub__panel" aria-label="Activity: tasks, drafts and audit" @keydown="onKey">
      <header class="hub__head">
        <div role="tablist" aria-label="Activity sections" class="hub__tabs" @keydown="onTabKey">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            role="tab"
            class="hub__tab"
            :aria-selected="tab === t.id"
            :tabindex="tab === t.id ? 0 : -1"
            :data-testid="`activity-tab-${t.id}`"
            @click="tab = t.id"
          >
            {{ t.label }} <span class="num">{{ t.count }}</span>
          </button>
        </div>
        <button type="button" class="icon-btn" aria-label="Close activity" @click="close()">
          <Icon name="close" :size="16" />
        </button>
      </header>

      <div v-if="tab === 'tasks'" role="tabpanel" class="hub__body" aria-label="Tasks">
        <div class="hub__filters">
          <div role="group" aria-label="Assignee" class="seg">
            <button type="button" class="fchip" :aria-pressed="!mine" @click="mine = false">All</button>
            <button type="button" class="fchip" :aria-pressed="mine" data-testid="tasks-mine" @click="mine = true">Mine</button>
          </div>
          <label :for="ids.region" class="sr-only">Region</label>
          <select :id="ids.region" v-model="regionId" class="control control--sm">
            <option :value="null">All regions</option>
            <option v-for="r in regions" :key="r.regionId" :value="r.regionId">{{ r.name }}</option>
          </select>
        </div>
        <ul class="list">
          <li v-for="r in tasks" :key="r.task.taskId" class="item">
            <div class="item__top">
              <strong>{{ r.task.title }}</strong>
              <StatusChip :status="r.statusStyle" dense />
            </div>
            <p class="item__meta">
              {{ r.typeLabel }} · {{ r.assigneeName }}<template v-if="r.dueText"> · due {{ r.dueText }}</template>
            </p>
            <button v-if="r.incidentId" type="button" class="linkish" @click="go(r.incidentId)">Open {{ r.incidentId }}</button>
          </li>
          <li v-if="!tasks.length" class="empty-state">{{ mine ? 'No tasks assigned to you.' : 'No local tasks yet. Create one from a case’s Actions tab.' }}</li>
        </ul>
      </div>

      <div v-else-if="tab === 'drafts'" role="tabpanel" class="hub__body" aria-label="Drafts">
        <p class="hub__note">Drafts are prepared locally. PORTOS sends nothing.</p>
        <ul class="list">
          <li v-for="d in drafts" :key="d.draft.draftId" class="item">
            <div class="item__top">
              <strong>{{ d.draft.subject }}</strong>
              <StatusChip :status="{ tone: d.draft.status === 'ready' ? 'info' : 'neutral', label: d.draft.status === 'ready' ? 'Ready · not sent' : 'Draft · not sent', icon: 'info' }" dense />
            </div>
            <p class="item__meta">To {{ d.recipientText }} · {{ d.authorName }} · {{ d.createdText }}</p>
            <button v-if="d.incidentId" type="button" class="linkish" @click="go(d.incidentId)">Open {{ d.incidentId }}</button>
          </li>
          <li v-if="!drafts.length" class="empty-state">No drafts yet.</li>
        </ul>
      </div>

      <div v-else role="tabpanel" class="hub__body" aria-label="Audit">
        <div class="hub__filters hub__filters--grid">
          <label :for="ids.actor" class="sr-only">Actor</label>
          <select :id="ids.actor" v-model="filter.actorUserId" class="control control--sm" data-testid="audit-actor">
            <option :value="null">Any actor</option>
            <option v-for="u in users" :key="u.userId" :value="u.userId">{{ u.displayName }}</option>
          </select>
          <label :for="ids.action" class="sr-only">Action</label>
          <select :id="ids.action" v-model="filter.actionType" class="control control--sm" data-testid="audit-action">
            <option :value="null">Any action</option>
            <option v-for="a in actionTypes" :key="a" :value="a">{{ AUDIT_ACTION_LABEL[a] }}</option>
          </select>
          <label :for="ids.entity" class="sr-only">Entity ID</label>
          <input :id="ids.entity" v-model="filter.entity" type="search" class="control control--sm" placeholder="Entity ID, e.g. INC-0001" data-testid="audit-entity" />
        </div>
        <div class="hub__actions">
          <span class="item__meta num">{{ audit.length }} of {{ wf.state.audit.length }} events</span>
          <button v-if="filtered" type="button" class="linkish" @click="clearFilter">Clear filters</button>
          <button type="button" class="btn btn--sm" :disabled="!audit.length" data-testid="export-audit" @click="exportJson">Export audit JSON</button>
        </div>
        <ol class="list">
          <li v-for="a in audit" :key="a.auditId" class="item" :data-testid="`audit-${a.auditId}`">
            <div class="item__top">
              <strong>{{ a.summary }}</strong>
              <span class="item__tag">{{ a.actionLabel }}</span>
            </div>
            <p class="item__meta">{{ a.actorText }} · sim {{ a.simText }}</p>
            <p v-if="a.notes" class="item__notes">{{ a.notes }}</p>
            <p class="item__meta mono">{{ a.auditId }} · {{ a.refsText }} · clicked {{ a.wallText }}</p>
          </li>
          <li v-if="!audit.length" class="empty-state">{{ filtered ? 'No audit events match these filters.' : 'No local decisions recorded yet.' }}</li>
        </ol>
        <p class="hub__note">{{ PROTOTYPE_CAVEAT }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hub {
  position: relative;
}
.hub__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  font-size: var(--text-13);
  font-weight: 500;
  color: var(--color-ink);
  cursor: pointer;
}
.hub__trigger:hover,
.hub__trigger[aria-expanded='true'] {
  background: var(--color-panel-secondary);
}
.hub__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: #fff;
  font-size: var(--text-11);
  line-height: 18px;
  text-align: center;
}
.hub__unsaved {
  padding: 0 6px;
  border-radius: var(--radius-chip);
  background: var(--color-warning-subtle);
  color: var(--color-warning);
  font-size: var(--text-11);
  line-height: 18px;
}
.hub__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 420px;
  max-height: calc(100vh - var(--shell-header-h) - 24px);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.hub__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 8px 0 12px;
  border-bottom: 1px solid var(--color-border);
}
.hub__tabs {
  display: flex;
  gap: 4px;
}
.hub__tab {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  font-size: var(--text-13);
  font-weight: 500;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.hub__tab[aria-selected='true'] {
  border-bottom-color: var(--color-accent);
  color: var(--color-ink);
}
.hub__tab .num {
  margin-left: 2px;
  color: var(--color-ink-muted);
}
.hub__body {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}
.hub__filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.hub__filters--grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.hub__filters--grid input {
  grid-column: 1 / -1;
}
.hub__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hub__actions .btn {
  margin-left: auto;
}
.seg {
  display: flex;
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
  color: var(--color-accent-hover);
}
.control--sm {
  height: 28px;
  font-size: var(--text-12);
}
.list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: grid;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
  line-height: 16px;
}
.item__top {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 8px;
}
.item__top strong {
  font-weight: 600;
}
.item__tag {
  flex: none;
  padding: 0 6px;
  border-radius: var(--radius-chip);
  background: var(--color-panel-secondary);
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
  line-height: 18px;
}
.item__meta,
.item__notes,
.hub__note {
  margin: 0;
  font-size: var(--text-11);
  line-height: 14px;
  color: var(--color-ink-muted);
}
.item__notes {
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  line-height: 16px;
}
.linkish {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-hover);
  font: inherit;
  font-size: var(--text-12);
  cursor: pointer;
}
</style>
