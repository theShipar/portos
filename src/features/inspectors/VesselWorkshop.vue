<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
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
  <div class="workshop" data-testid="vessel-workshop" :data-model="modelKey" :data-mode="mode" :data-exploded="exploded ? '1' : '0'" :data-ready="scene ? '1' : '0'">
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
    </div>
    <div class="workshop__bar">
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
  </div>
</template>

<style scoped>
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
