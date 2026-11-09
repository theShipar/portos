<script setup lang="ts">
import { useViewStore } from '@/stores/view';
import SummaryInspector from './SummaryInspector.vue';
import VesselInspector from './VesselInspector.vue';

const view = useViewStore();
</script>

<template>
  <template v-if="view.selection">
    <VesselInspector v-if="view.selection.kind === 'vessel'" :key="`v-${view.selection.id}`" :vessel-id="view.selection.id" />
    <SummaryInspector v-else :key="`${view.selection.kind}-${view.selection.id}`" :entity="view.selection" />
  </template>
</template>
