import { computed, markRaw, watch } from 'vue';
import { flags } from '@/core/flags';
import { defaultTerminal, equipmentCardView, terminalOpsView, twinOpsFrame } from '@/selectors/terminalOps';
import { useCargoStore } from '@/stores/cargo';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';

/** Typed terminal read models at the committed scenario time (10 Hz), shared by the port panel and berth card. */
export function useTerminalOps() {
  const catalog = useCatalogStore();
  const snap = useSnapshotStore();
  const view = useViewStore();
  const clock = useClockStore();
  const cargo = useCargoStore();

  const ctx = computed(() => {
    const c = catalog.catalog;
    const model = snap.portTwin;
    return flags.v3PortTwin && c?.terminalOps && model ? { c, model } : null;
  });
  /** Ports whose quay cranes run from transfer events need the cargo module. */
  const needsCargo = computed(() => {
    const x = ctx.value;
    return !!x && x.model.terminals.some((t) => (x.c.terminalOps!.equipmentByTerminal.get(t.terminalId) ?? []).some((e) => e.kind === 'sts_crane'));
  });
  watch(needsCargo, (v) => v && void cargo.ensure(), { immediate: true });

  const frame = computed(() => (ctx.value ? markRaw(twinOpsFrame(ctx.value.c, ctx.value.model, cargo.index, clock.timeMs)) : null));
  const terminals = computed(() => {
    const x = ctx.value;
    return x ? x.model.terminals.filter((t) => x.c.terminalOps!.equipmentByTerminal.has(t.terminalId)).map((t) => ({ terminalId: t.terminalId, name: t.name })) : [];
  });
  const terminalId = computed(() => (ctx.value ? defaultTerminal(ctx.value.c, ctx.value.model, view.berthId, view.equipmentId) : null));
  const opsView = computed(() => {
    const x = ctx.value;
    const id = terminalId.value;
    if (!x || !id || !x.c.terminalOps!.equipmentByTerminal.has(id)) return null;
    return terminalOpsView(x.c, x.model, id, view.berthId, cargo.index, frame.value, clock.timeMs);
  });
  const equipmentCard = computed(() => (ctx.value && view.equipmentId ? equipmentCardView(ctx.value.c, view.equipmentId, cargo.index, frame.value, clock.timeMs) : null));

  return { frame, terminals, terminalId, opsView, equipmentCard, cargoStatus: computed(() => cargo.status) };
}
