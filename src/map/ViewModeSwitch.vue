<script setup lang="ts">
import { computed } from 'vue';
import { supportsViewMode, type ViewMode } from '@/core/scope';
import { useNavigation } from '@/router/useRouteSync';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

const view = useViewStore();
const nav = useNavigation();
const can2d = computed(() => supportsViewMode(view.scope, '2d'));

const modes: { id: ViewMode; label: string; icon: 'cube' | 'map' }[] = [
  { id: '3d', label: '3D', icon: 'cube' },
  { id: '2d', label: '2D', icon: 'map' },
];

function set(m: ViewMode) {
  if (m === view.viewMode || (m === '2d' && !can2d.value)) return;
  nav.setViewMode(m);
}
</script>

<template>
  <div class="vms" role="group" aria-label="Map view mode">
    <button
      v-for="m in modes"
      :key="m.id"
      type="button"
      class="vms__btn"
      :aria-pressed="view.viewMode === m.id"
      :disabled="m.id === '2d' && !can2d"
      :title="m.id === '2d' && !can2d ? '2D map is available at region and port scope' : `${m.label} view (selection is kept)`"
      :data-testid="`view-mode-${m.id}`"
      @click="set(m.id)"
    >
      <Icon :name="m.icon" :size="14" />
      {{ m.label }}
    </button>
  </div>
</template>

<style scoped>
.vms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 2px;
  gap: 2px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  box-shadow: var(--shadow-panel);
}
.vms__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: calc(var(--radius-input) - 2px);
  background: transparent;
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  font-weight: 500;
  cursor: pointer;
}
.vms__btn[aria-pressed='true'] {
  background: var(--color-accent-subtle);
  color: var(--color-accent-hover);
}
.vms__btn:disabled {
  color: var(--color-ink-muted);
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
