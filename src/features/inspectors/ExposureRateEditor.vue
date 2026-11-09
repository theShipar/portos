<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { formatUsd, formatUtc, sentenceCase } from '@/core/format';
import type { VoyageImpact } from '@/selectors/impact';
import { useAssumptionStore, validateDailyRate } from '@/stores/assumptions';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSessionStore } from '@/stores/session';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = defineProps<{ impact: VoyageImpact }>();

const assumptions = useAssumptionStore();
const clock = useClockStore();
const session = useSessionStore();
const notices = useNoticeStore();
const inputId = useId();
const errId = useId();
const noteId = useId();

const editing = ref(false);
const draft = ref('');
const error = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const editBtn = ref<HTMLButtonElement | null>(null);

const canEdit = computed(() => session.can('action.scenario.propose'));
const rate = computed(() => props.impact.exposure?.rate ?? null);
const override = computed(() => (rate.value?.kind === 'user' ? rate.value : null));
const fixtureRate = computed(() => (rate.value?.kind === 'user' ? rate.value.fixtureUsdPerDay : rate.value?.usdPerDay ?? null));

async function start() {
  draft.value = props.impact.exposure?.dailyDelayCostUsd?.toString() ?? '';
  error.value = null;
  editing.value = true;
  await nextTick();
  input.value?.select();
}

async function cancel() {
  editing.value = false;
  error.value = null;
  await nextTick();
  editBtn.value?.focus();
}

async function apply() {
  const v = validateDailyRate(draft.value);
  if (!v.ok) {
    error.value = v.reason;
    input.value?.focus();
    return;
  }
  const userId = session.user?.userId ?? 'unknown';
  if (v.usd === fixtureRate.value) assumptions.resetRate(props.impact.voyageId);
  else assumptions.setRate(props.impact.voyageId, v.usd, userId, clock.iso);
  notices.push(`${props.impact.voyageId} exposure now uses ${formatUsd(v.usd)}/day${v.usd === fixtureRate.value ? ' (fixture rate)' : ' as a user scenario'}. Every view updates together.`, 'success', { timeoutMs: 5000 });
  await cancel();
}

async function reset() {
  assumptions.resetRate(props.impact.voyageId);
  notices.push(`${props.impact.voyageId} exposure restored to the fixture rate ${formatUsd(fixtureRate.value)}/day.`, 'info', { timeoutMs: 5000 });
  await nextTick();
  editBtn.value?.focus();
}
</script>

<template>
  <div class="rate" data-testid="rate-editor">
    <div v-if="!editing" class="rate__row">
      <span class="rate__label">Daily delay rate</span>
      <strong class="mono" data-testid="rate-value">{{ impact.rateText }}</strong>
      <StatusChip v-if="override" :status="{ tone: 'selected', label: 'User scenario', icon: 'check' }" dense />
      <span class="rate__actions">
        <button
          ref="editBtn"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          :aria-describedby="!canEdit ? noteId : undefined"
          data-testid="rate-edit"
          @click="start"
        >
          Edit rate
        </button>
        <button v-if="override && canEdit" type="button" class="btn btn--sm" data-testid="rate-reset" @click="reset">Reset</button>
      </span>
    </div>
    <form v-else class="rate__form" novalidate @submit.prevent="apply" @keydown.esc.stop.prevent="cancel">
      <label :for="inputId" class="rate__label">Daily delay rate (USD/day)</label>
      <div class="rate__inputs">
        <input
          :id="inputId"
          ref="input"
          v-model="draft"
          class="input mono"
          inputmode="numeric"
          autocomplete="off"
          :aria-invalid="!!error"
          :aria-describedby="error ? errId : undefined"
          data-testid="rate-input"
        />
        <button type="submit" class="btn btn--sm btn--primary" data-testid="rate-apply">Apply</button>
        <button type="button" class="btn btn--sm" @click="cancel">Cancel</button>
      </div>
      <p v-if="error" :id="errId" class="rate__error" role="alert">{{ error }}</p>
    </form>
    <p v-if="override && !editing" class="rate__note">
      Set by {{ override.setByUserId }} at {{ formatUtc(override.setAtUtc) }} · fixture {{ fixtureRate === null ? 'has no rate' : `${formatUsd(fixtureRate)}/day` }}
    </p>
    <p v-if="!canEdit && !editing" :id="noteId" class="rate__note">{{ sentenceCase(session.user?.role ?? 'viewer') }} role can view but not change scenario assumptions.</p>
  </div>
</template>

<style scoped>
.rate {
  display: grid;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
  font-size: var(--text-12);
}
.rate__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.rate__label {
  color: var(--color-ink-secondary);
}
.rate__actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.rate__form {
  display: grid;
  gap: 4px;
}
.rate__inputs {
  display: flex;
  gap: 6px;
}
.rate__inputs .input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  font-size: var(--text-12);
}
.rate__inputs .input[aria-invalid='true'] {
  border-color: var(--color-critical);
}
.rate__error {
  margin: 0;
  color: var(--color-critical);
  font-size: var(--text-11);
}
.rate__note {
  margin: 0;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>
