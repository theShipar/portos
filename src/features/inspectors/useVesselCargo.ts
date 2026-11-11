import { computed, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { formatUtc } from '@/core/format';
import { flags } from '@/core/flags';
import { holdCount } from '@/engines/cargo';
import { modelKeyOf } from '@/map/vessels3d/categories';
import { useNavigation } from '@/router/useRouteSync';
import { baysOfHold, selectBaySection, selectCargoSummary, selectCompartmentDetail, selectSlotDetail, selectWorkshopCargo, validCargoFocus } from '@/selectors/vesselCargo';
import { WORKSHOP_CAMERA_MODES, type WorkshopCameraMode } from '@/spatial/scenes/VesselWorkshopScene';
import { useCargoStore } from '@/stores/cargo';
import { useCatalogStore } from '@/stores/catalog';
import { useNoticeStore } from '@/stores/notices';
import { useSnapshotStore } from '@/stores/snapshot';

const one = (v: unknown): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s !== '' ? s : null;
};

/**
 * Cargo inspection state for one vessel. URL keys (`cargo`, `hold`, `cam`, `explode`) are the source of truth so a
 * selected slot survives reload and sharing; everything shown is derived by `selectors/vesselCargo`.
 */
export function useVesselCargo(vesselId: Ref<string>) {
  const route = useRoute();
  const nav = useNavigation();
  const cargo = useCargoStore();
  const catalog = useCatalogStore();
  const snap = useSnapshotStore();
  const notices = useNoticeStore();
  const enabled = flags.v3ShipPreview;
  if (enabled) void cargo.ensure();

  const t = computed(() => snap.snapshot?.timeMs ?? 0);
  const vessel = computed(() => catalog.catalog?.byId.vessel.get(vesselId.value) ?? null);
  const modelKey = computed(() => modelKeyOf(vessel.value?.vesselType ?? ''));
  const plan = computed(() => cargo.index?.plans.get(vesselId.value) ?? null);
  const workshop = computed(() => (catalog.catalog && cargo.index ? selectWorkshopCargo(catalog.catalog, cargo.index, vesselId.value, t.value) : null));
  const summary = computed(() => (catalog.catalog && cargo.index ? selectCargoSummary(catalog.catalog, cargo.index, vesselId.value, t.value) : null));

  const rawFocus = computed(() => one(route.query.cargo));
  const focus = computed(() => (cargo.index ? validCargoFocus(cargo.index, vesselId.value, rawFocus.value) : null));
  const hold = computed(() => {
    const n = Number(one(route.query.hold));
    return plan.value?.archetype === 'container' && Number.isInteger(n) && n >= 1 && n <= holdCount(plan.value) ? n : null;
  });
  const mode = computed<WorkshopCameraMode>(() => {
    const m = one(route.query.cam);
    return m && (WORKSHOP_CAMERA_MODES as readonly string[]).includes(m) ? (m as WorkshopCameraMode) : 'free';
  });
  const exploded = computed(() => one(route.query.explode) === '1');

  const bayPick = ref<number | null>(null);
  const bay = computed(() => {
    const g = plan.value?.grid;
    if (!g) return null;
    const fromFocus = focus.value ? cargo.index?.slots.get(vesselId.value)?.get(focus.value)?.bay : undefined;
    if (fromFocus !== undefined) return fromFocus;
    if (bayPick.value !== null && g.bays.includes(bayPick.value) && (hold.value === null || baysOfHold(plan.value!, hold.value).includes(bayPick.value))) return bayPick.value;
    return hold.value !== null ? (baysOfHold(plan.value!, hold.value)[0] ?? g.bays[0]!) : g.bays[0]!;
  });
  const baySection = computed(() =>
    catalog.catalog && cargo.index && bay.value !== null ? selectBaySection(catalog.catalog, cargo.index, vesselId.value, bay.value, t.value, workshop.value?.occupancy) : null,
  );
  const detail = computed(() => {
    const c = catalog.catalog;
    const idx = cargo.index;
    if (!c || !idx || !focus.value || !plan.value) return null;
    return plan.value.archetype === 'container' ? selectSlotDetail(c, idx, vesselId.value, focus.value, t.value, workshop.value?.occupancy) : selectCompartmentDetail(c, idx, vesselId.value, focus.value, t.value);
  });

  // A slot that does not belong to this vessel's plan (e.g. a container slot on an LNG carrier) is dropped with a notice.
  watch(
    () => [rawFocus.value, cargo.status, vesselId.value] as const,
    ([raw, status]) => {
      if (!enabled || !raw || status !== 'ready' || focus.value) return;
      const what = plan.value ? (plan.value.archetype === 'container' ? 'container stowage' : `${plan.value.archetype.toUpperCase()} compartments`) : 'no modelled cargo';
      notices.push(`${raw} is not part of ${vessel.value?.name ?? vesselId.value}'s cargo plan (${what}). Showing the vessel.`, 'warning', { timeoutMs: 8000 });
      void nav.setCargoState({ cargo: null });
    },
    { immediate: true },
  );

  return {
    enabled,
    status: computed(() => cargo.status),
    asOfText: computed(() => `Simulated · ${formatUtc(t.value)}`),
    modelKey,
    plan,
    workshop,
    summary,
    focus,
    hold,
    mode,
    exploded,
    bay,
    baySection,
    detail,
    setFocus: (id: string | null) => nav.setCargoState({ cargo: id }),
    setHold: (n: number | null) => {
      bayPick.value = null;
      return nav.setCargoState({ hold: n, cargo: null });
    },
    setBay: (b: number) => {
      bayPick.value = b;
      if (focus.value) void nav.setCargoState({ cargo: null });
    },
    setMode: (m: WorkshopCameraMode) => nav.setCargoState({ cam: m === 'free' ? null : m }),
    setExploded: (on: boolean) => nav.setCargoState({ explode: on }),
  };
}
