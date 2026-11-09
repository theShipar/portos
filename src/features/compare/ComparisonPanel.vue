<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { downloadJson } from '@/core/download';
import { formatHours, formatNm, formatUsd, formatUtc } from '@/core/format';
import { toIsoUtc } from '@/core/time';
import { compareScenarios, defaultScenarioInputs, exportComparison, SCENARIO_LIMITS, validateScenarioInputs, type ScenarioOption } from '@/engines/scenario';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSessionStore } from '@/stores/session';
import { useSnapshotStore } from '@/stores/snapshot';
import { useWorkflowStore } from '@/stores/workflow';
import { PERMISSION, permissionCheck } from '@/workflows/incidentMachine';
import type { ScenarioInputs } from '@/workflows/types';
import { statusStyle } from '@/styles/tokens';
import InspectorDrawer from '@/components/shell/InspectorDrawer.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const props = defineProps<{ voyageId: string }>();
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const clock = useClockStore();
const session = useSessionStore();
const wf = useWorkflowStore();
const notices = useNoticeStore();
const nav = useNavigation();
const route = useRoute();
const router = useRouter();
const ids = { wait: useId(), rate: useId(), speed: useId(), assignee: useId(), err: useId() };

const voyage = computed(() => catalog.catalog?.byId.voyage.get(props.voyageId) ?? null);
const caseId = computed(() => {
  const q = route.query.case;
  const fromQuery = typeof q === 'string' && catalog.catalog?.byId.incident.get(q)?.voyageId === props.voyageId ? q : null;
  return fromQuery ?? catalog.catalog?.incidentsByVoyage.get(props.voyageId)?.find((i) => snap.snapshot?.incidents.get(i.incidentId)?.visible)?.incidentId ?? null;
});

const draft = ref({ wait: '0', rate: '', speed: '14' });
function resetInputs() {
  const c = catalog.catalog;
  const s = snap.snapshot;
  const d = c && s ? defaultScenarioInputs(c, s, props.voyageId) : null;
  draft.value = { wait: String(d?.extraWaitHours ?? 0), rate: d?.dailyCostUsd === null || d?.dailyCostUsd === undefined ? '' : String(d.dailyCostUsd), speed: String(d?.speedAssumptionKn ?? 14) };
}
watch(() => [props.voyageId, catalog.status] as const, resetInputs, { immediate: true });

const inputs = computed<ScenarioInputs>(() => ({
  extraWaitHours: Number(draft.value.wait || 0),
  dailyCostUsd: draft.value.rate.trim() === '' ? null : Number(draft.value.rate.replace(/[$,\s]/g, '')),
  speedAssumptionKn: Number(draft.value.speed),
}));
const inputError = computed(() => validateScenarioInputs(inputs.value));
const cmp = computed(() => (catalog.catalog && snap.snapshot && !inputError.value ? compareScenarios(catalog.catalog, snap.snapshot, props.voyageId, inputs.value) : null));

const canPropose = computed(() => permissionCheck(session.user, PERMISSION.propose, 'propose scenario plans'));
const canAccept = computed(() => permissionCheck(session.user, PERMISSION.accept, 'accept scenario plans'));
const assignees = computed(() => (catalog.catalog?.users ?? []).filter((u) => u.role !== 'viewer'));
const followUp = ref(session.user && session.user.role !== 'viewer' ? session.user.userId : 'USR-005');
const decisions = computed(() => wf.state.decisions.filter((d) => d.voyageId === props.voyageId).reverse());
const actionError = ref<string | null>(null);

const diffText = (o: ScenarioOption) => {
  if (o.optionId === 'baseline') return 'Baseline';
  const h = o.diffVsBaseline.hours;
  const usd = o.diffVsBaseline.usd;
  const hText = h === null ? 'delay n/a' : h === 0 ? 'same delay' : `${formatHours(h, { signed: true })}`;
  const uText = usd === null ? 'cost n/a' : usd === 0 ? 'same cost' : `${usd > 0 ? '+' : '−'}${formatUsd(Math.abs(usd))}`;
  return `${hText} · ${uText}`;
};

function propose(o: ScenarioOption) {
  const v = voyage.value;
  if (!v) return;
  const r = wf.dispatch({ type: 'scenario.propose', voyageId: props.voyageId, incidentId: caseId.value, optionId: o.optionId, optionName: o.name, inputs: inputs.value, followUpAssigneeUserId: followUp.value, portId: v.originPortId });
  actionError.value = r.ok ? null : r.error;
}

function accept(decisionId: string) {
  const r = wf.dispatch({ type: 'scenario.accept', decisionId });
  actionError.value = r.ok ? null : r.error;
}

function exportJson() {
  if (!cmp.value) return;
  const ok = downloadJson(`portos-scenario-${props.voyageId}.json`, exportComparison(cmp.value, toIsoUtc(Date.now())));
  notices.push(ok ? 'Scenario comparison exported (synthetic data).' : 'The browser blocked the download.', ok ? 'success' : 'warning');
}

function backToCase() {
  if (caseId.value) nav.openEntity({ kind: 'incident', id: caseId.value });
  else router.push({ name: 'voyage', params: { voyageId: props.voyageId }, query: { ...route.query, case: undefined } });
}
</script>

<template>
  <InspectorDrawer
    v-if="voyage"
    :title="`Compare responses · ${voyage.voyageId}`"
    kind-label="Scenario comparison"
    :expanded="true"
    @close="nav.closeSelection()"
  >
    <template #subtitle>
      <span class="sub">{{ catalog.catalog?.byId.vessel.get(voyage.vesselId)?.name }} · baseline as of {{ formatUtc(clock.timeMs) }}</span>
    </template>
    <template #banner>
      <p class="banner">Client-side what-if on synthetic data. Choosing a plan records a proposal; it never changes the vessel route, ETA or any external system.</p>
      <p v-if="clock.mode === 'replay'" class="banner banner--warn">Viewing history: the comparison uses the forecast known at {{ formatUtc(clock.timeMs) }}. Proposals made at Now do not apply to this time.</p>
    </template>

    <div class="stack" data-testid="comparison">
      <form class="form inputs" novalidate @submit.prevent>
        <h3 class="section-title">Assumptions (editable)</h3>
        <div class="form-row form-row--3">
          <label class="field" :for="ids.wait">Extra wait (h)
            <input :id="ids.wait" v-model="draft.wait" type="number" min="0" :max="SCENARIO_LIMITS.maxExtraWaitHours" step="1" class="control mono" data-testid="cmp-wait" :aria-invalid="!!inputError" :aria-describedby="inputError ? ids.err : undefined" />
          </label>
          <label class="field" :for="ids.rate">Daily cost (USD/day)
            <input :id="ids.rate" v-model="draft.rate" inputmode="numeric" class="control mono" placeholder="Unknown" data-testid="cmp-rate" />
          </label>
          <label class="field" :for="ids.speed">Speed (kn)
            <input :id="ids.speed" v-model="draft.speed" type="number" :min="SCENARIO_LIMITS.minSpeedKn" :max="SCENARIO_LIMITS.maxSpeedKn" step="0.5" class="control mono" />
          </label>
        </div>
        <p v-if="inputError" :id="ids.err" class="form-error" role="alert">{{ inputError }}</p>
        <div class="form-row">
          <button type="button" class="btn btn--sm btn--ghost" @click="resetInputs">Restore baseline inputs</button>
        </div>
      </form>

      <div class="legend" aria-label="Map line styles">
        <span><i class="ln ln--planned" />Planned</span>
        <span><i class="ln ln--proposed" />Proposed (candidate)</span>
        <span><i class="ln ln--recorded" />Recorded track</span>
      </div>

      <ol v-if="cmp" class="options">
        <li v-for="o in cmp.options" :key="o.optionId" class="opt" :class="{ 'opt--disabled': !o.feasible }" :data-testid="`option-${o.optionId}`">
          <div class="opt__head">
            <strong>{{ o.name }}</strong>
            <StatusChip :status="statusStyle('confidence', o.confidence)" dense />
          </div>
          <p class="opt__summary">{{ o.summary }}</p>
          <template v-if="o.feasible">
            <dl class="metrics">
              <div><dt>Projected delay</dt><dd class="mono" data-testid="opt-delay">{{ formatHours(o.etaDeltaHours, { signed: true }) }}</dd></div>
              <div><dt>Extra distance</dt><dd class="mono">{{ o.extraDistanceNm ? formatNm(o.extraDistanceNm) : '0 nm' }}</dd></div>
              <div><dt>Est. exposure</dt><dd class="mono" data-testid="opt-exposure">{{ o.exposureUsd === null ? 'Unavailable' : formatUsd(o.exposureUsd) }}</dd></div>
              <div><dt>vs baseline</dt><dd class="mono">{{ diffText(o) }}</dd></div>
            </dl>
            <p class="opt__formula mono">{{ o.formula }}</p>
            <details class="opt__more">
              <summary>Assumptions, steps and risks</summary>
              <p class="form-hint">Approval: {{ o.requiredApproval === 'manager' ? 'Manager' : 'None required' }} · Stakeholders: {{ o.stakeholders.join(', ') || '—' }}</p>
              <ul>
                <li v-for="a in o.assumptions" :key="a">{{ a }}</li>
                <li v-for="s in o.coordinationSteps" :key="s">Step: {{ s }}</li>
                <li v-for="r in o.risks" :key="r">Risk: {{ r }}</li>
              </ul>
            </details>
            <button type="button" class="btn btn--sm" :disabled="!!wf.blockReason || !canPropose.ok" :title="wf.blockReason ?? (canPropose.ok ? undefined : canPropose.reason)" :data-testid="`propose-${o.optionId}`" @click="propose(o)">Propose this plan</button>
          </template>
          <p v-else class="empty-state">{{ o.notApplicableReason }}</p>
        </li>
      </ol>

      <div class="form-row">
        <label class="field" :for="ids.assignee">Follow-up task goes to
          <select :id="ids.assignee" v-model="followUp" class="control">
            <option v-for="u in assignees" :key="u.userId" :value="u.userId">{{ u.displayName }} · {{ u.title }}</option>
          </select>
        </label>
      </div>
      <p v-if="!canPropose.ok" class="form-hint">{{ canPropose.reason }}</p>
      <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>

      <div>
        <h3 class="section-title">Proposals for {{ voyage.voyageId }}</h3>
        <ul v-if="decisions.length" class="decisions">
          <li v-for="d in decisions" :key="d.decisionId" class="decision">
            <div class="opt__head">
              <span><strong>{{ d.optionName }}</strong> <span class="mono form-hint">{{ d.decisionId }}</span></span>
              <StatusChip :status="{ tone: d.status === 'accepted' ? 'healthy' : 'info', label: d.status === 'accepted' ? 'Accepted (scenario only)' : 'Proposed', icon: d.status === 'accepted' ? 'check' : 'clock' }" dense />
            </div>
            <span class="form-hint mono">wait +{{ d.inputs.extraWaitHours }} h · {{ d.inputs.dailyCostUsd === null ? 'no rate' : `${formatUsd(d.inputs.dailyCostUsd)}/day` }} · {{ d.inputs.speedAssumptionKn }} kn · by {{ catalog.catalog?.byId.user.get(d.proposedByUserId)?.displayName }}</span>
            <button
              v-if="d.status === 'proposed'"
              type="button"
              class="btn btn--sm"
              :disabled="!!wf.blockReason || !canAccept.ok"
              :title="canAccept.ok ? undefined : canAccept.reason"
              data-testid="accept-plan"
              @click="accept(d.decisionId)"
            >
              Accept plan
            </button>
            <span v-if="d.status === 'proposed' && !canAccept.ok" class="form-hint">{{ canAccept.reason }}</span>
          </li>
        </ul>
        <p v-else class="empty-state">No proposals yet.</p>
      </div>

      <div class="form-row">
        <button type="button" class="btn btn--sm" :disabled="!cmp" data-testid="export-comparison" @click="exportJson">Export comparison JSON</button>
        <button type="button" class="btn btn--sm" @click="backToCase">{{ caseId ? `Back to ${caseId}` : 'Back to voyage' }}</button>
      </div>
      <p class="form-hint">{{ cmp?.disclaimer }}</p>
    </div>
  </InspectorDrawer>
  <div v-else class="drawer-missing panel" role="alert">Voyage {{ voyageId }} is not in the simulated dataset.</div>
</template>

<style scoped>
.sub {
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.banner {
  margin: 0 var(--space-5) var(--space-2);
  padding: 8px 12px;
  border-radius: var(--radius-input);
  background: var(--color-info-subtle);
  color: var(--color-info);
  font-size: var(--text-12);
}
.banner--warn {
  background: var(--color-warning-subtle);
  color: var(--color-ink);
}
.stack {
  display: grid;
  gap: var(--space-4);
}
.section-title {
  font-size: var(--text-14);
  line-height: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}
.inputs {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
}
.form-row--3 > .field {
  flex: 1;
  min-width: 100px;
}
.legend {
  display: flex;
  gap: 14px;
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ln {
  display: inline-block;
  width: 22px;
  height: 0;
  border-top: 3px solid var(--color-route-selected);
}
.ln--proposed {
  border-top-style: dashed;
}
.ln--recorded {
  border-top: 2px dotted var(--color-ink-secondary);
}
.options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.opt,
.decision {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
  justify-items: start;
}
.opt > *,
.decision > * {
  justify-self: stretch;
}
.opt > .btn,
.decision > .btn {
  justify-self: start;
}
.opt--disabled {
  background: var(--color-panel-secondary);
}
.opt__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.opt__summary {
  color: var(--color-ink-secondary);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0;
}
.metrics dt {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.metrics dd {
  margin: 0;
  font-weight: 600;
}
.opt__formula {
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
  overflow-wrap: anywhere;
}
.opt__more summary {
  cursor: pointer;
  color: var(--color-ink-secondary);
}
.opt__more ul {
  margin: 4px 0 0;
  padding-left: 16px;
  color: var(--color-ink-secondary);
}
.decisions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.drawer-missing {
  position: absolute;
  top: 12px;
  right: 12px;
  width: var(--inspector-w);
  padding: 16px;
}
</style>
