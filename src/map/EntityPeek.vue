<script setup lang="ts">
import { computed } from 'vue';
import { buildVesselInspector } from '@/selectors/vessel';
import { peekDeltas } from '@/selectors/vesselBrief';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps<{ vesselId: string; x: number; y: number; viewW: number; viewH: number; more?: number }>();
const emit = defineEmits<{ enter: []; leave: []; done: [] }>();

const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();

const PEEK_W = 248;
const PEEK_H = 84;
const GAP = 14;

const model = computed(() => (catalog.catalog && snap.snapshot ? buildVesselInspector(catalog.catalog, snap.snapshot, props.vesselId) : null));
const deltas = computed(() => (model.value ? peekDeltas(model.value) : []));
/** Opens right/below the anchor and flips at the viewport edges so the card never clips. */
const placement = computed(() => {
  const flipX = props.x + GAP + PEEK_W > props.viewW - 8;
  const flipY = props.y + GAP + PEEK_H > props.viewH - 8;
  return {
    left: Math.max(8, flipX ? props.x - GAP - PEEK_W : props.x + GAP),
    top: Math.max(8, flipY ? props.y - GAP - PEEK_H : props.y + GAP),
    side: `${flipY ? 'top' : 'bottom'}-${flipX ? 'left' : 'right'}`,
  };
});

function inspect() {
  nav.openEntity({ kind: 'vessel', id: props.vesselId });
  emit('done');
}
function follow() {
  if (view.selection?.kind !== 'vessel' || view.selection.id !== props.vesselId) nav.openEntity({ kind: 'vessel', id: props.vesselId });
  view.startFollow(props.vesselId);
  emit('done');
}
</script>

<template>
  <div
    v-if="model"
    class="peek"
    :style="{ transform: `translate(${placement.left}px, ${placement.top}px)`, width: `${PEEK_W}px` }"
    role="dialog"
    :aria-label="`${model.name} quick view`"
    data-testid="entity-peek"
    :data-side="placement.side"
    @pointerenter="emit('enter')"
    @pointerleave="emit('leave')"
  >
    <div class="peek__line">
      <strong class="peek__title">{{ model.name }}</strong>
      <span class="peek__sim">Simulated</span>
    </div>
    <div class="peek__line">
      <span v-for="d in deltas" :key="d.label" class="peek__delta" :class="`peek__delta--${d.tone}`" data-testid="peek-delta">{{ d.label }}</span>
      <span v-if="more" class="peek__more">+{{ more }} here</span>
    </div>
    <div class="peek__actions">
      <button type="button" class="peek__btn" :disabled="view.viewMode !== '3d'" data-testid="peek-follow" @click="follow"><Icon name="crosshair" :size="13" /> Follow</button>
      <button type="button" class="peek__btn peek__btn--primary" data-testid="peek-inspect" @click="inspect">Inspect</button>
    </div>
  </div>
</template>

<style scoped>
.peek {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 26;
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  line-height: 16px;
  pointer-events: auto;
}
.peek__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}
.peek__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.peek__sim,
.peek__more {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.peek__delta {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-ink-secondary);
}
.peek__delta--critical {
  color: var(--color-critical);
}
.peek__delta--warning {
  color: var(--color-warning-ink);
}
.peek__delta--healthy {
  color: var(--color-healthy);
}
.peek__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.peek__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: var(--color-ink);
  font-size: var(--text-11);
  font-weight: 600;
  cursor: pointer;
}
.peek__btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.peek__btn--primary {
  border-color: var(--color-accent-fill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}
</style>
