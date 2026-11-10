<script setup lang="ts">
import { useViewStore } from '@/stores/view';
import ComparisonPanel from '@/features/compare/ComparisonPanel.vue';
import IncidentInspector from '@/features/incident/IncidentInspector.vue';
import SummaryInspector from './SummaryInspector.vue';
import VesselInspector from './VesselInspector.vue';

const view = useViewStore();
</script>

<template>
  <template v-if="view.selection">
    <VesselInspector v-if="view.selection.kind === 'vessel'" :key="`v-${view.selection.id}`" :vessel-id="view.selection.id" />
    <IncidentInspector v-else-if="view.selection.kind === 'incident'" :key="`i-${view.selection.id}`" :incident-id="view.selection.id" />
    <ComparisonPanel v-else-if="view.selection.kind === 'voyage' && view.comparing" :key="`c-${view.selection.id}`" :voyage-id="view.selection.id" />
    <SummaryInspector v-else :key="`${view.selection.kind}-${view.selection.id}`" :entity="view.selection" />
  </template>
</template>
