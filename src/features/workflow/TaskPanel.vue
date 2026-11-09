<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { fromUtcInputValue, HOUR, toUtcInputValue } from '@/core/time';
import { taskRow } from '@/selectors/incident';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSessionStore } from '@/stores/session';
import { useWorkflowStore } from '@/stores/workflow';
import { PERMISSION, permissionCheck } from '@/workflows/incidentMachine';
import { TASK_TYPE_LABEL, TASK_TYPES, type TaskStatus, type TaskType } from '@/workflows/types';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = withDefaults(defineProps<{ incidentId?: string | null; voyageId?: string | null; portId?: string | null; allowCreate?: boolean }>(), {
  incidentId: null,
  voyageId: null,
  portId: null,
  allowCreate: true,
});

const catalog = useCatalogStore();
const clock = useClockStore();
const session = useSessionStore();
const wf = useWorkflowStore();
const ids = { type: useId(), assignee: useId(), due: useId(), notes: useId(), err: useId(), reason: useId() };

const rows = computed(() => {
  const c = catalog.catalog;
  if (!c) return [];
  return wf.state.tasks
    .filter((t) => (props.incidentId ? t.relatedIncidentId === props.incidentId : props.voyageId ? t.voyageId === props.voyageId : true))
    .map((t) => taskRow(c, t, clock.timeMs))
    .reverse();
});
const assignees = computed(() => (catalog.catalog?.users ?? []).filter((u) => u.role !== 'viewer'));
const canTask = computed(() => permissionCheck(session.user, PERMISSION.task, 'create or update tasks'));
const disabledReason = computed(() => wf.blockReason ?? (canTask.value.ok ? null : canTask.value.reason));

const creating = ref(false);
const form = ref({ type: 'port_agent_eta_followup' as TaskType, assignee: '', due: '', notes: '' });
const error = ref<string | null>(null);

function open() {
  form.value = { type: props.incidentId ? 'port_agent_eta_followup' : 'voyage_monitoring', assignee: session.user?.role === 'viewer' ? '' : (session.user?.userId ?? ''), due: toUtcInputValue(clock.timeMs + 4 * HOUR), notes: '' };
  error.value = null;
  creating.value = true;
}

function submit() {
  const due = fromUtcInputValue(form.value.due);
  if (due === undefined) {
    error.value = 'Enter the due time as YYYY-MM-DD HH:MM (UTC).';
    return;
  }
  const r = wf.dispatch({
    type: 'task.create',
    task: { type: form.value.type, relatedIncidentId: props.incidentId, voyageId: props.voyageId, portId: props.portId, assigneeUserId: form.value.assignee, dueAtUtc: due, notes: form.value.notes },
  });
  if (!r.ok) {
    error.value = r.error;
    return;
  }
  creating.value = false;
}

function setStatus(taskId: string, status: TaskStatus) {
  const r = wf.dispatch({ type: 'task.status', taskId, status });
  if (!r.ok) error.value = r.error;
}

const NEXT: Record<TaskStatus, { status: TaskStatus; label: string }[]> = {
  open: [
    { status: 'in_progress', label: 'Start' },
    { status: 'done', label: 'Done' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  in_progress: [
    { status: 'done', label: 'Done' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  done: [{ status: 'open', label: 'Reopen' }],
  cancelled: [{ status: 'open', label: 'Reopen' }],
};
</script>

<template>
  <div class="tasks" data-testid="task-panel">
    <ul v-if="rows.length" class="tasks__list">
      <li v-for="r in rows" :key="r.task.taskId" class="task" :data-testid="`task-${r.task.taskId}`">
        <div class="task__head">
          <strong class="task__title">{{ r.task.title }}</strong>
          <StatusChip :status="r.statusStyle" dense />
        </div>
        <div class="task__meta mono">{{ r.task.taskId }} · {{ r.assigneeName }}<template v-if="r.dueText"> · due {{ r.dueText }}</template></div>
        <p v-if="r.task.notes" class="task__notes">{{ r.task.notes }}</p>
        <div class="form-row">
          <button
            v-for="n in NEXT[r.task.status]"
            :key="n.status"
            type="button"
            class="btn btn--sm"
            :disabled="!!disabledReason"
            :title="disabledReason ?? undefined"
            @click="setStatus(r.task.taskId, n.status)"
          >
            {{ n.label }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="empty-state">No tasks yet. Tasks are local demo records; nobody is notified.</p>

    <template v-if="allowCreate">
      <button v-if="!creating" type="button" class="btn btn--sm" :disabled="!!disabledReason" :aria-describedby="disabledReason ? ids.reason : undefined" data-testid="task-new" @click="open">New task</button>
      <form v-else class="form task-form" novalidate data-testid="task-form" @submit.prevent="submit" @keydown.esc.stop.prevent="creating = false">
        <label class="field" :for="ids.type">Type
          <select :id="ids.type" v-model="form.type" class="control">
            <option v-for="t in TASK_TYPES" :key="t" :value="t">{{ TASK_TYPE_LABEL[t] }}</option>
          </select>
        </label>
        <div class="form-row form-row--2">
          <label class="field" :for="ids.assignee">Assignee
            <select :id="ids.assignee" v-model="form.assignee" class="control" data-testid="task-assignee">
              <option value="" disabled>Choose a coordinator</option>
              <option v-for="u in assignees" :key="u.userId" :value="u.userId">{{ u.displayName }} · {{ u.title }}</option>
            </select>
          </label>
          <label class="field" :for="ids.due">Due (UTC)
            <input :id="ids.due" v-model="form.due" type="datetime-local" class="control mono" />
          </label>
        </div>
        <label class="field" :for="ids.notes">Notes
          <textarea :id="ids.notes" v-model="form.notes" class="control" rows="2" maxlength="1000" />
        </label>
        <p v-if="error" :id="ids.err" class="form-error" role="alert">{{ error }}</p>
        <div class="form-row">
          <button type="submit" class="btn btn--sm btn--primary" data-testid="task-create">Create task</button>
          <button type="button" class="btn btn--sm" @click="creating = false">Cancel</button>
        </div>
      </form>
    </template>
    <p v-if="disabledReason" :id="ids.reason" class="form-hint">{{ disabledReason }}</p>
    <p v-if="error && !creating" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.tasks {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}
.tasks__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  width: 100%;
}
.task {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
}
.task__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.task__title {
  font-size: var(--text-12);
  font-weight: 600;
}
.task__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.task__notes {
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.task-form {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.form-row--2 > .field {
  flex: 1;
  min-width: 140px;
}
</style>
