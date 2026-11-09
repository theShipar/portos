<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { useRouter } from 'vue-router';
import { fromUtcInputValue, HOUR, toUtcInputValue } from '@/core/time';
import type { IncidentModel } from '@/selectors/incident';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useWorkflowStore } from '@/stores/workflow';
import { LIFECYCLE, type TransitionId } from '@/workflows/incidentMachine';
import { RESOLUTION_LABEL, RESOLUTION_REASONS, type ResolutionReason } from '@/workflows/types';
import { statusStyle } from '@/styles/tokens';
import DraftPanel from '@/features/workflow/DraftPanel.vue';
import TaskPanel from '@/features/workflow/TaskPanel.vue';

const props = defineProps<{ model: IncidentModel }>();
const catalog = useCatalogStore();
const clock = useClockStore();
const wf = useWorkflowStore();
const router = useRouter();
const ids = { reason: useId(), evidence: useId(), ack: useId(), reopen: useId(), assignee: useId(), due: useId(), assignNote: useId(), note: useId(), block: useId() };

const id = computed(() => props.model.incident.incidentId);
const status = computed(() => props.model.state.status);
const stepIndex = computed(() => LIFECYCLE.indexOf(status.value));
const steps = computed(() => LIFECYCLE.map((s, i) => ({ status: s, label: statusStyle('incident', s).label, state: i < stepIndex.value ? 'done' : i === stepIndex.value ? 'current' : 'todo' })));
const assignees = computed(() => (catalog.catalog?.users ?? []).filter((u) => u.role !== 'viewer'));
const block = computed(() => wf.blockReason);

const panel = ref<null | 'resolve' | 'reopen'>(null);
const error = ref<string | null>(null);
const resolveForm = ref({ reason: '' as ResolutionReason | '', evidence: '', ack: false });
const reopenReason = ref('');
const firstField = ref<HTMLElement | null>(null);

async function onTransition(t: TransitionId) {
  error.value = null;
  if (t === 'resolve' || t === 'reopen') {
    panel.value = t;
    resolveForm.value = { reason: '', evidence: '', ack: false };
    reopenReason.value = '';
    await nextTick();
    firstField.value?.focus();
    return;
  }
  const r = wf.dispatch({ type: 'incident.transition', incidentId: id.value, transition: t });
  if (!r.ok) error.value = r.error;
}

function submitResolve() {
  const f = resolveForm.value;
  const r = wf.dispatch({
    type: 'incident.transition',
    incidentId: id.value,
    transition: 'resolve',
    resolution: f.reason ? { reason: f.reason, evidenceNote: f.evidence, simulationAck: f.ack } : undefined,
  });
  if (!r.ok) error.value = r.error;
  else panel.value = null;
}

function submitReopen() {
  const r = wf.dispatch({ type: 'incident.transition', incidentId: id.value, transition: 'reopen', note: reopenReason.value });
  if (!r.ok) error.value = r.error;
  else panel.value = null;
}

const assign = ref({ user: props.model.state.ownerUserId ?? '', due: toUtcInputValue(clock.timeMs + 6 * HOUR), note: '' });
const assignError = ref<string | null>(null);
function submitAssign() {
  const due = fromUtcInputValue(assign.value.due);
  if (due === undefined) {
    assignError.value = 'Enter the due time as YYYY-MM-DD HH:MM (UTC).';
    return;
  }
  const r = wf.dispatch({ type: 'incident.assign', incidentId: id.value, assigneeUserId: assign.value.user || null, dueAtUtc: due, note: assign.value.note });
  assignError.value = r.ok ? null : r.error;
  if (r.ok) assign.value.note = '';
}

const note = ref('');
const noteError = ref<string | null>(null);
function submitNote() {
  const r = wf.dispatch({ type: 'incident.note', incidentId: id.value, text: note.value });
  noteError.value = r.ok ? null : r.error;
  if (r.ok) note.value = '';
}

function openComparison() {
  const cur = router.currentRoute.value;
  router.push({ name: 'compare', params: { voyageId: props.model.incident.voyageId }, query: { ...cur.query, case: id.value } });
}
</script>

<template>
  <div class="actions">
    <p v-if="block" :id="ids.block" class="block" role="status">{{ block }}</p>

    <section aria-labelledby="st-h">
      <h3 id="st-h" class="section-title">Case status</h3>
      <ol class="stepper" aria-label="Incident lifecycle">
        <li v-for="s in steps" :key="s.status" :class="`step step--${s.state}`" :aria-current="s.state === 'current' ? 'step' : undefined">
          <span class="step__dot" aria-hidden="true" />
          <span class="step__label">{{ s.label }}</span>
        </li>
      </ol>
      <div class="form-row">
        <button
          v-for="t in model.transitions"
          :key="t.rule.id"
          type="button"
          class="btn btn--sm"
          :class="{ 'btn--primary': t.rule.id === model.transitions[0].rule.id && t.rule.id !== 'resolve' }"
          :disabled="!!block || !t.check.ok"
          :title="block ?? (t.check.ok ? undefined : t.check.reason)"
          :data-testid="`transition-${t.rule.id}`"
          @click="onTransition(t.rule.id)"
        >
          {{ t.rule.label }}
        </button>
      </div>
      <ul v-if="!block && model.transitions.some((t) => !t.check.ok)" class="reasons">
        <li v-for="t in model.transitions.filter((x) => !x.check.ok)" :key="t.rule.id" class="form-hint">{{ t.rule.label }}: {{ !t.check.ok ? t.check.reason : '' }}</li>
      </ul>
      <p v-if="model.state.status === 'acknowledged'" class="form-hint">Acknowledged means someone is looking at it, not that the problem is solved.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <form v-if="panel === 'resolve'" class="form sub-form" novalidate data-testid="resolve-form" @submit.prevent="submitResolve" @keydown.esc.stop.prevent="panel = null">
        <label class="field" :for="ids.reason">Resolution reason
          <select :id="ids.reason" ref="firstField" v-model="resolveForm.reason" class="control" data-testid="resolve-reason">
            <option value="" disabled>Choose a reason</option>
            <option v-for="r in RESOLUTION_REASONS" :key="r" :value="r">{{ RESOLUTION_LABEL[r] }}</option>
          </select>
        </label>
        <label class="field" :for="ids.evidence">Supporting evidence{{ model.needsVerification ? ' (required: inputs need verification)' : '' }}
          <textarea :id="ids.evidence" v-model="resolveForm.evidence" class="control" rows="2" maxlength="1000" placeholder="Source or assumption you verified" />
        </label>
        <label class="check" :for="ids.ack">
          <input :id="ids.ack" v-model="resolveForm.ack" type="checkbox" :disabled="model.needsVerification" />
          Resolved in simulation (no external confirmation)
        </label>
        <div class="form-row">
          <button type="submit" class="btn btn--sm btn--primary" data-testid="resolve-submit">Resolve case</button>
          <button type="button" class="btn btn--sm" @click="panel = null">Cancel</button>
        </div>
      </form>

      <form v-if="panel === 'reopen'" class="form sub-form" novalidate @submit.prevent="submitReopen" @keydown.esc.stop.prevent="panel = null">
        <label class="field" :for="ids.reopen">Reason for reopening
          <textarea :id="ids.reopen" ref="firstField" v-model="reopenReason" class="control" rows="2" maxlength="1000" />
        </label>
        <div class="form-row">
          <button type="submit" class="btn btn--sm btn--primary">Reopen case</button>
          <button type="button" class="btn btn--sm" @click="panel = null">Cancel</button>
        </div>
      </form>
    </section>

    <section aria-labelledby="own-h">
      <h3 id="own-h" class="section-title">Owner <span class="section-note">{{ model.ownerName }}<template v-if="model.dueText"> · due {{ model.dueText }}</template></span></h3>
      <form class="form" novalidate data-testid="assign-form" @submit.prevent="submitAssign">
        <div class="form-row form-row--2">
          <label class="field" :for="ids.assignee">Coordinator
            <select :id="ids.assignee" v-model="assign.user" class="control" :disabled="!!block || !model.can.assign.ok" data-testid="assign-user">
              <option value="">Unassigned</option>
              <option v-for="u in assignees" :key="u.userId" :value="u.userId">{{ u.displayName }} · {{ u.title }}</option>
            </select>
          </label>
          <label class="field" :for="ids.due">Due (UTC)
            <input :id="ids.due" v-model="assign.due" type="datetime-local" class="control mono" :disabled="!!block || !model.can.assign.ok" />
          </label>
        </div>
        <label class="field" :for="ids.assignNote">Escalation note (optional)
          <input :id="ids.assignNote" v-model="assign.note" class="control" maxlength="1000" :disabled="!!block || !model.can.assign.ok" />
        </label>
        <div class="form-row">
          <button type="submit" class="btn btn--sm" :disabled="!!block || !model.can.assign.ok" data-testid="assign-submit">Save owner</button>
          <span v-if="!model.can.assign.ok" class="form-hint">{{ model.can.assign.reason }}</span>
        </div>
        <p v-if="assignError" class="form-error" role="alert">{{ assignError }}</p>
      </form>
    </section>

    <section aria-labelledby="note-h">
      <h3 id="note-h" class="section-title">Notes</h3>
      <ul v-if="model.notes.length" class="notes">
        <li v-for="n in model.notes" :key="n.noteId">
          <span class="notes__meta">{{ n.author }} · {{ n.atText }}</span>
          <span>{{ n.text }}</span>
        </li>
      </ul>
      <form class="form" novalidate @submit.prevent="submitNote">
        <label class="field" :for="ids.note">Add note
          <textarea :id="ids.note" v-model="note" class="control" rows="2" maxlength="1000" :disabled="!!block || !model.can.note.ok" data-testid="note-input" />
        </label>
        <div class="form-row">
          <button type="submit" class="btn btn--sm" :disabled="!!block || !model.can.note.ok" data-testid="note-submit">Add note</button>
          <span v-if="!model.can.note.ok" class="form-hint">{{ model.can.note.reason }}</span>
        </div>
        <p v-if="noteError" class="form-error" role="alert">{{ noteError }}</p>
      </form>
    </section>

    <section aria-labelledby="task-h">
      <h3 id="task-h" class="section-title">Tasks</h3>
      <TaskPanel :incident-id="model.incident.incidentId" :voyage-id="model.incident.voyageId" :port-id="model.incident.portId" />
    </section>

    <section aria-labelledby="draft-h">
      <h3 id="draft-h" class="section-title">Communication drafts</h3>
      <DraftPanel :incident-id="model.incident.incidentId" />
    </section>

    <section aria-labelledby="cmp-h">
      <h3 id="cmp-h" class="section-title">Decision support</h3>
      <p class="form-hint">Compare response options for voyage {{ model.incident.voyageId }}. Proposals are recorded locally and never change the vessel route.</p>
      <button type="button" class="btn btn--sm" data-testid="open-comparison" @click="openComparison">Open comparison</button>
    </section>
  </div>
</template>

<style scoped>
.actions {
  display: grid;
  gap: var(--space-5);
}
section {
  display: grid;
  gap: var(--space-2);
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
.block {
  padding: 8px 10px;
  border-radius: var(--radius-input);
  background: var(--color-info-subtle);
  color: var(--color-info);
  font-size: var(--text-12);
}
.stepper {
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
}
.step {
  display: grid;
  justify-items: center;
  gap: 4px;
  text-align: center;
  font-size: var(--text-11);
  line-height: 13px;
  color: var(--color-ink-muted);
  position: relative;
}
.step::before {
  content: '';
  position: absolute;
  top: 5px;
  left: -50%;
  width: 100%;
  height: 2px;
  background: var(--color-border);
  z-index: 0;
}
.step:first-child::before {
  display: none;
}
.step--done::before,
.step--current::before {
  background: var(--color-ink-secondary);
}
.step__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-border-strong);
  background: var(--color-panel);
  z-index: 1;
}
.step--done .step__dot {
  background: var(--color-ink-secondary);
  border-color: var(--color-ink-secondary);
}
.step--current .step__dot {
  border-color: var(--color-accent);
  background: var(--color-accent);
}
.step--current {
  color: var(--color-ink);
  font-weight: 600;
}
.reasons {
  margin: 0;
  padding-left: 16px;
}
.sub-form {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-12);
}
.form-row--2 > .field {
  flex: 1;
  min-width: 140px;
}
.notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.notes li {
  display: grid;
  font-size: var(--text-12);
  padding-left: 10px;
  border-left: 2px solid var(--color-border);
}
.notes__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>
