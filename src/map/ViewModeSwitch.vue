<script setup lang="ts">
import { computed } from 'vue';
import { supportsViewMode, type ViewMode } from '@/core/scope';
import { useNavigation } from '@/router/useRouteSync';
import { useViewStore } from '@/stores/view';
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue';

const view = useViewStore();
const nav = useNavigation();
const can2d = computed(() => supportsViewMode(view.scope, '2d'));

const modes = computed((): SegmentOption<ViewMode>[] => [
  { id: '3d', label: '3D', icon: 'cube', title: '3D view (selection is kept)', testid: 'view-mode-3d' },
  { id: '2d', label: '2D', icon: 'map', disabled: !can2d.value, title: can2d.value ? '2D view (selection is kept)' : '2D map is available at region and port scope', testid: 'view-mode-2d' },
]);

function set(m: ViewMode) {
  if (m === view.viewMode || (m === '2d' && !can2d.value)) return;
  nav.setViewMode(m);
}
</script>

<template>
  <SegmentedControl class="vms" :options="modes" :model-value="view.viewMode" label="Map view mode" size="sm" @update:model-value="set" />
</template>
