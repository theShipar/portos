<script setup lang="ts">
import AppSelect from '@/components/ui/AppSelect.vue';
import { computed, ref, useId } from 'vue';
import { formatUtc } from '@/core/format';
import { useCatalogStore } from '@/stores/catalog';
import { useNoticeStore } from '@/stores/notices';
import { useSessionStore } from '@/stores/session';
import { useSnapshotStore } from '@/stores/snapshot';
import { useWorkflowStore } from '@/stores/workflow';
import { draftTemplate } from '@/workflows/handoff';
import { PERMISSION, permissionCheck } from '@/workflows/incidentMachine';
import { DRAFT_RECIPIENTS } from '@/workflows/reducer';
import { RECIPIENT_LABEL, type NotificationDraft, type RecipientRole } from '@/workflows/types';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = defineProps<{ incidentId: string }>();
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const session = useSessionStore();
const wf = useWorkflowStore();
const notices = useNoticeStore();
const ids = { recipient: useId(), subject: useId(), body: useId(), reason: useId() };

const drafts = computed(() => wf.state.drafts.filter((d) => d.relatedEntityIds.some((r) => r.kind === 'incident' && r.id === props.incidentId)).reverse());
const can = computed(() => permissionCheck(session.user, PERMISSION.task, 'prepare communication drafts'));
const disabledReason = computed(() => wf.blockReason ?? (can.value.ok ? null : can.value.reason));

type Editable = Pick<NotificationDraft, 'kind' | 'recipientRole' | 'subject' | 'body' | 'relatedEntityIds'>;
const editing = ref<Editable | null>(null);
const error = ref<string | null>(null);
const KIND_LABEL: Record<NotificationDraft['kind'], string> = { port_agent_eta_request: 'Port-agent ETA request', customer_status_update: 'Customer status update' };
const recipients = computed<RecipientRole[]>(() => (editing.value ? DRAFT_RECIPIENTS[editing.value.kind] : []));

function start(kind: NotificationDraft['kind']) {
  const c = catalog.catalog;
  const s = snap.snapshot;
  if (!c || !s) return;
  editing.value = draftTemplate(c, s, props.incidentId, kind);
  error.value = null;
}

function save() {
  if (!editing.value) return;
  const r = wf.dispatch({ type: 'draft.create', draft: editing.value });
  if (!r.ok) {
    error.value = r.error;
    return;
  }
  editing.value = null;
}

function act(cmd: 'draft.ready' | 'draft.discard', draftId: string) {
  const r = wf.dispatch({ type: cmd, draftId });
  if (!r.ok) error.value = r.error;
}

async function copy(d: NotificationDraft) {
  try {
    await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
    notices.push('Draft text copied. Nothing was sent.', 'info');
  } catch {
    notices.push('Clipboard is unavailable in this browser; select the text to copy it.', 'warning');
  }
}
</script>

<template>
  <div class="drafts" data-testid="draft-panel">
    <div v-if="!editing" class="form-row">
      <button type="button" class="btn btn--sm" :disabled="!!disabledReason" data-testid="draft-port-agent" @click="start('port_agent_eta_request')">Draft port-agent ETA request</button>
      <button type="button" class="btn btn--sm" :disabled="!!disabledReason" data-testid="draft-customer" @click="start('customer_status_update')">Draft customer update</button>
    </div>
    <form v-else class="form draft-form" novalidate data-testid="draft-form" @submit.prevent="save" @keydown.esc.stop.prevent="editing = null">
      <p class="micro-label">{{ KIND_LABEL[editing.kind] }} · draft prepared locally</p>
      <label class="field" :for="ids.recipient">Recipient role
        <AppSelect :id="ids.recipient" v-model="editing.recipientRole" class="control">
          <option v-for="r in recipients" :key="r" :value="r">{{ RECIPIENT_LABEL[r] }}</option>
        </AppSelect>
      </label>
      <label class="field" :for="ids.subject">Subject
        <input :id="ids.subject" v-model="editing.subject" class="control" maxlength="200" />
      </label>
      <label class="field" :for="ids.body">Message
        <textarea :id="ids.body" v-model="editing.body" class="control" rows="8" maxlength="4000" />
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-row">
        <button type="submit" class="btn btn--sm btn--primary" data-testid="draft-save">Save draft</button>
        <button type="button" class="btn btn--sm" @click="editing = null">Cancel</button>
      </div>
      <p class="form-hint">The prototype has no mail integration. Saving keeps the draft in this browser only.</p>
    </form>

    <ul v-if="drafts.length" class="drafts__list">
      <li v-for="d in drafts" :key="d.draftId" class="draft" :data-testid="`draft-${d.draftId}`">
        <div class="draft__head">
          <strong>{{ d.subject }}</strong>
          <StatusChip :status="{ tone: d.status === 'ready' ? 'info' : 'neutral', label: d.status === 'ready' ? 'Ready · not sent' : 'Draft prepared locally', icon: 'info' }" dense />
        </div>
        <div class="draft__meta mono">{{ d.draftId }} · {{ RECIPIENT_LABEL[d.recipientRole] }} · {{ formatUtc(d.createdAtUtc) }}</div>
        <details class="draft__body">
          <summary>Preview message</summary>
          <pre>{{ d.body }}</pre>
        </details>
        <div class="form-row">
          <button v-if="d.status === 'draft'" type="button" class="btn btn--sm" :disabled="!!disabledReason" @click="act('draft.ready', d.draftId)">Mark ready</button>
          <button type="button" class="btn btn--sm" @click="copy(d)">Copy text</button>
          <button type="button" class="btn btn--sm btn--ghost" :disabled="!!disabledReason" @click="act('draft.discard', d.draftId)">Discard</button>
        </div>
      </li>
    </ul>
    <p v-if="disabledReason" :id="ids.reason" class="form-hint">{{ disabledReason }}</p>
    <p v-if="error && !editing" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.drafts {
  display: grid;
  gap: var(--space-2);
}
.draft-form {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.drafts__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.draft {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
}
.draft__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.draft__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.draft__body summary {
  cursor: pointer;
  color: var(--color-ink-secondary);
}
.draft__body pre {
  margin: 6px 0 0;
  white-space: pre-wrap;
  font-family: var(--font-ui);
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
</style>
