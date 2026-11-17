<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { StowagePlan } from '@/core/cargoTypes';
import type { ShipModelKey } from '@/map/vessels3d/categories';
import { VesselWorkshopScene, type WorkshopCameraMode, type WorkshopStats } from '@/spatial/scenes/VesselWorkshopScene';
import { useSessionStore } from '@/stores/session';
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue';
import Icon from '@/components/ui/Icon.vue';
import ShipSilhouette from '@/components/ui/ShipSilhouette.vue';

/**
 * Host for the vessel workshop scene (V3 spec 04/04): 3D preview, camera rigs, exploded view and slot picking.
 * All cargo state arrives through props from selectors; the canvas only draws and reports picks.
 */
const props = defineProps<{
  vesselName?: string;
  vesselType: string;
  modelKey: ShipModelKey;
  plan: StowagePlan | null;
  filled: Map<string, { swatch: number; restricted: boolean }>;
  selected: string | null;
  hold: number | null;
  holdOfSlot: ((slotId: string) => number) | null;
  mode: WorkshopCameraMode;
  exploded: boolean;
}>();
const emit = defineEmits<{ pick: [id: string | null]; 'update:mode': [WorkshopCameraMode]; 'update:exploded': [boolean] }>();

const session = useSessionStore();
const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<VesselWorkshopScene | null>(null);
const failed = ref(false);
const expanded = ref(false);
const dialog = ref<HTMLDialogElement | null>(null);
const expandButton = ref<HTMLButtonElement | null>(null);
async function expand() {
  expanded.value = true;
  await nextTick();
  dialog.value?.showModal();
  const bounds = host.value?.getBoundingClientRect();
  if (bounds) scene.value?.resize(bounds.width, bounds.height);
  scene.value?.fitView();
}
function collapse() {
  dialog.value?.close();
  expanded.value = false;
  nextTick(() => expandButton.value?.focus());
}
let ro: ResizeObserver | null = null;
let down: { x: number; y: number } | null = null;

const modes: SegmentOption<WorkshopCameraMode>[] = [
  { id: 'chase', label: 'Chase', title: 'Chase: 1.3 ship lengths astern', testid: 'workshop-cam-chase' },
  { id: 'above', label: 'Above', title: 'Plan view from above, bow to the right', testid: 'workshop-cam-above' },
  { id: 'orbit', label: 'Orbit', title: 'Slow orbit around the vessel', testid: 'workshop-cam-orbit' },
  { id: 'deck', label: 'Deck', title: 'From the bridge looking over the deck', testid: 'workshop-cam-deck' },
  { id: 'free', label: 'Free', title: 'Drag to orbit, scroll to zoom', testid: 'workshop-cam-free' },
];

function pushCargo() {
  scene.value?.setCargo({ filled: props.filled, selected: props.selected, hold: props.hold, holdOfSlot: props.holdOfSlot ?? undefined });
}

onMounted(() => {
  if (!canvas.value || !host.value) return;
  try {
    const sc = new VesselWorkshopScene(canvas.value, { reducedMotion: !!session.reducedMotion });
    scene.value = sc;
    sc.onModeChange = (m) => emit('update:mode', m);
    const r = host.value.getBoundingClientRect();
    sc.resize(r.width, r.height);
    sc.setMode(props.mode, { animate: false });
    sc.setVessel(props.modelKey, props.plan);
    sc.setExploded(props.exploded);
    pushCargo();
    ro = new ResizeObserver(([e]) => e && sc.resize(e.contentRect.width, e.contentRect.height));
    ro.observe(host.value);
    testHook().__portosWorkshop = {
      stats: (): WorkshopStats => sc.stats(),
      project: (id: string) => {
        const p = sc.project(id);
        const b = canvas.value?.getBoundingClientRect();
        return p && b ? { x: b.left + p.x, y: b.top + p.y } : null;
      },
    };
  } catch {
    failed.value = true;
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
  scene.value?.dispose();
  scene.value = null;
  delete testHook().__portosWorkshop;
});

function testHook() {
  return window as unknown as { __portosWorkshop?: unknown };
}

watch(
  () => [props.modelKey, props.plan] as const,
  ([key, plan]) => scene.value?.setVessel(key, plan),
);
watch(() => [props.filled, props.selected, props.hold] as const, pushCargo);
watch(
  () => props.mode,
  (m) => {
    if (scene.value && scene.value.getMode() !== m) scene.value.setMode(m);
  },
);
watch(
  () => props.exploded,
  (on) => scene.value?.setExploded(on),
);

function onDown(e: PointerEvent) {
  down = { x: e.clientX, y: e.clientY };
}
function onUp(e: PointerEvent) {
  if (!down || !scene.value || !canvas.value) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 4) return;
  const b = canvas.value.getBoundingClientRect();
  const hit = scene.value.pickAt(e.clientX - b.left, e.clientY - b.top);
  emit('pick', hit?.id ?? null);
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="workshop-dialog" aria-label="Expanded vessel inspection" @cancel.prevent="collapse" @keydown.esc.stop.prevent="collapse" @click="($event.target === dialog) && collapse()" />
  </Teleport>
  <Teleport :to="expanded && dialog ? dialog : 'body'" :disabled="!expanded">
  <div class="workshop" :class="{ 'workshop--expanded': expanded }" data-testid="vessel-workshop" :data-model="modelKey" :data-mode="mode" :data-exploded="exploded ? '1' : '0'" :data-ready="scene ? '1' : '0'">
    <header v-if="expanded" class="workshop__header">
      <div><span class="micro-label">Vessel inspection · Simulated</span><h2>{{ vesselName ?? vesselType }}</h2><p>Explore the model. Select a compartment or cargo slot below to inspect its details.</p></div>
      <button type="button" class="icon-btn" aria-label="Close expanded vessel view" @click="collapse"><Icon name="close" /></button>
    </header>
    <div class="workshop__view">
    <div ref="host" class="workshop__stage">
      <canvas
        v-show="!failed"
        ref="canvas"
        class="workshop__canvas"
        role="img"
        :aria-label="`3D preview of the ${vesselType}${plan ? ' with its simulated stowage' : ''}. Use the slot picker below for keyboard access.`"
        @pointerdown="onDown"
        @pointerup="onUp"
      />
      <div v-if="failed" class="workshop__fallback">
        <ShipSilhouette :vessel-type="vesselType" />
        <span>3D preview unavailable in this browser.</span>
      </div>
      <span class="workshop__tag">Simulated</span>
      <button v-if="!expanded" ref="expandButton" type="button" class="btn btn--sm workshop__expand" aria-label="Expand vessel preview" @click="expand"><Icon name="expand" :size="14" /> Expand</button>
    </div>
    <aside v-if="expanded" class="workshop__annotation" aria-label="Selected cargo annotation" aria-live="polite"><slot name="annotation"><p>Select a compartment to see its information.</p></slot></aside>
    </div>
    <div class="workshop__bar">
      <button v-if="expanded" type="button" class="btn btn--sm" @click="scene?.fitView()"><Icon name="expand" :size="14" /> Fit vessel</button>
      <SegmentedControl :options="modes" :model-value="mode" label="Preview camera" size="sm" @update:model-value="emit('update:mode', $event)" />
      <button
        type="button"
        class="btn btn--sm"
        :class="{ 'btn--active': exploded }"
        :aria-pressed="exploded"
        :disabled="!plan"
        :title="plan ? 'Separate bays and tiers (or holds and tanks) to see inside' : 'No cargo plan for this vessel'"
        data-testid="workshop-explode"
        @click="emit('update:exploded', !exploded)"
      >
        <Icon name="cube" :size="14" /> Explode
      </button>
    </div>
    <div v-if="expanded" class="workshop__cargo"><slot name="cargo" /></div>
  </div>
  </Teleport>
</template>

<style scoped>
.workshop-dialog { width: min(1400px, calc(100vw - 64px)); max-width: none; max-height: calc(100dvh - 64px); margin: auto; padding: 0; border: 1px solid var(--color-border); border-radius: 20px; background: var(--color-panel); color: var(--color-ink); box-shadow: var(--shadow-drawer); overflow: auto; }
.workshop-dialog::backdrop { background: color-mix(in srgb, var(--color-space) 70%, transparent); backdrop-filter: blur(12px); }
.workshop__view { min-width: 0; }
.workshop--expanded { padding: 24px; gap: 20px; }
.workshop__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.workshop__header h2 { margin: 4px 0 8px; font-size: 24px; }
.workshop__header p { margin: 0; color: var(--color-ink-secondary); font-size: var(--text-13); }
.workshop--expanded .workshop__view { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); gap: 20px; align-items: start; }
.workshop--expanded .workshop__stage { height: clamp(280px, 45vh, 560px); border: 1px solid var(--color-border); border-radius: 12px; }
.workshop__annotation { min-width: 0; max-height: 56vh; overflow: auto; padding: 2px; }
.workshop__annotation > p { padding: 20px; color: var(--color-ink-secondary); }
.workshop__expand { position: absolute; right: 12px; top: 12px; background: var(--color-panel); }
.workshop__cargo { display: grid; gap: 20px; padding-top: 20px; border-top: 1px solid var(--color-border); }
.workshop__cargo :deep(.cmp) { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px; }
.workshop__cargo :deep(.cmp__btn) { min-height: 48px; padding: 12px; }
@media(max-width: 760px) {
 .workshop-dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
 .workshop--expanded { padding: 16px; }
 .workshop--expanded .workshop__view { grid-template-columns: 1fr; }
 .workshop__annotation { max-height: none; }
}

.workshop {
  display: grid;
  gap: 8px;
}
.workshop__stage {
  position: relative;
  height: 196px;
  border-radius: var(--radius-input);
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 30%, var(--color-map-ocean-mid), var(--color-map-ocean));
}
.workshop__canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.workshop__canvas:active {
  cursor: grabbing;
}
.workshop__fallback {
  display: grid;
  place-items: center;
  gap: 6px;
  height: 100%;
  padding: 12px;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.workshop__tag {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-size: var(--text-11);
  color: var(--color-ink-on-dark);
  background: color-mix(in srgb, var(--color-space) 45%, transparent);
}
.workshop__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
</style>
