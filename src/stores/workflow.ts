import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { toIsoUtc } from '@/core/time';
import type { EntityRef } from '@/core/types';
import { needsVerification } from '@/engines/priority';
import { getSnapshotAt, incidentStatusAt } from '@/engines/snapshot';
import { incidentOverlay, reduceWorkflow, type WorkflowCommand, type WorkflowContext, type WorkflowResult } from '@/workflows/reducer';
import { emptyWorkflow, type WorkflowState } from '@/workflows/types';
import { isWorkflowState } from '@/workflows/validate';
import { useCatalogStore } from './catalog';
import { useClockStore } from './clock';
import { useNoticeStore } from './notices';
import { loadStored, saveStored, STORAGE_KEYS } from './persist';
import { useSessionStore } from './session';

/** Local demo decisions (incident lifecycle, tasks, drafts, proposals, audit). Fixture data is never mutated. */
export const useWorkflowStore = defineStore('workflow', () => {
  const catalog = useCatalogStore();
  const session = useSessionStore();
  const clock = useClockStore();
  const notices = useNoticeStore();

  const loaded = loadStored(STORAGE_KEYS.workflow, isWorkflowState, emptyWorkflow());
  const state = shallowRef<WorkflowState>(loaded.value);
  const storageWarning = loaded.corrupted ? 'Saved demo decisions were unreadable and have been reset. The simulated event history is unchanged.' : null;
  /** False when the browser refused to store the latest change (blocked or full storage). */
  const saved = ref(true);
  watch(state, (v) => (saved.value = saveStored(STORAGE_KEYS.workflow, v)));

  const overlay = computed(() => incidentOverlay(state.value));
  /** Decisions are taken at "Now (simulated)"; history is read-only. */
  const blockReason = computed(() => (clock.mode === 'replay' ? 'Decisions are recorded at Now (simulated). Return to now to act.' : null));
  const outstandingTasks = computed(() => state.value.tasks.filter((t) => t.status === 'open' || t.status === 'in_progress'));

  function context(): WorkflowContext | null {
    const c = catalog.catalog;
    if (!c) return null;
    const live = getSnapshotAt(c, c.anchorMs, { incidents: overlay.value });
    return {
      actor: session.user,
      users: c.byId.user,
      simNowMs: clock.timeMs,
      simNowIso: clock.iso,
      wallNowIso: toIsoUtc(Date.now()),
      baseIncident: (id) => {
        const inc = c.byId.incident.get(id);
        return inc ? incidentStatusAt(c, inc, c.anchorMs) : null;
      },
      incidentRefs: (id) => {
        const inc = c.byId.incident.get(id);
        const refs: EntityRef[] = [{ kind: 'incident', id }];
        return inc ? [...refs, ...inc.entityRefs] : refs;
      },
      needsVerification: (id) => {
        const inc = c.byId.incident.get(id);
        return inc ? needsVerification(c, live, inc) : true;
      },
    };
  }

  function dispatch(cmd: WorkflowCommand, opts: { quiet?: boolean } = {}): WorkflowResult {
    if (blockReason.value && cmd.type !== 'history.note') return { ok: false, error: blockReason.value };
    const ctx = context();
    if (!ctx) return { ok: false, error: 'The simulated dataset is not loaded yet.' };
    const r = reduceWorkflow(state.value, cmd, ctx);
    if (!r.ok) return r;
    state.value = r.state;
    if (!saved.value) notices.push('Not saved: browser storage is unavailable, so this decision lasts only until the tab closes.', 'warning', { timeoutMs: 8000 });
    if (!opts.quiet) {
      const incidentId = 'incidentId' in cmd ? cmd.incidentId : null;
      const undo = r.undoable && incidentId ? { label: 'Undo', run: () => dispatch({ type: 'incident.undo', incidentId, auditId: r.audit.auditId }) } : undefined;
      notices.push(r.message, 'success', { action: undo });
    }
    return r;
  }

  function reset() {
    state.value = emptyWorkflow();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.workflow) notices.push('Demo decisions changed in another tab. Reload this tab to see them.', 'info', { persistent: true });
    });
  }

  return { state, storageWarning, saved, overlay, blockReason, outstandingTasks, dispatch, reset };
});
