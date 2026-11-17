<script setup lang="ts">
import type { CompartmentDetailModel, SlotDetailModel } from '@/selectors/vesselCargo';
import DetailCard from '@/components/ui/DetailCard.vue';
import FieldList from '@/components/ui/FieldList.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
defineProps<{ detail: SlotDetailModel | CompartmentDetailModel | null; focus: string | null }>();
const emit = defineEmits<{ focus: [string | null] }>();
</script>
<template>
    <div v-if="detail" class="cargo__detail" data-testid="cargo-detail" :data-focus="focus">
      <p class="cargo__slot mono">{{ detail.label }}<template v-if="detail.kind === 'slot'"> · Hold {{ detail.hold }}</template></p>
      <FieldList v-if="detail.kind === 'compartment'" :fields="detail.fields" />
      <DetailCard v-if="detail.manifest" :title="detail.manifest.title" :eyebrow="detail.manifest.eyebrow" :caption="detail.manifest.caption" selected data-testid="cargo-manifest">
        <template v-if="detail.manifest.chips.length" #status>
          <StatusChip v-for="ch in detail.manifest.chips" :key="ch.label" :status="ch" dense />
        </template>
        <p class="cargo__where" data-testid="cargo-location">{{ detail.manifest.locationText }}</p>
        <p v-if="detail.manifest.nextText" class="cargo__next">Next: {{ detail.manifest.nextText }}</p>
        <FieldList :fields="detail.manifest.fields" />
      </DetailCard>
      <p v-else-if="detail.kind === 'slot'" class="empty" data-testid="cargo-empty-slot">Empty slot at this time.</p>
      <button type="button" class="btn btn--sm" @click="emit('focus', null)">Clear selection</button>
    </div>
</template>
<style scoped>
.cargo__detail { display: grid; gap: 16px; padding: 20px; border: 1px solid var(--color-border); border-left: 3px solid var(--color-accent); border-radius: 12px; background: var(--color-panel); color: var(--color-ink); overflow-wrap: anywhere; }
.cargo__slot { margin: 0; font-size: var(--text-14); font-weight: 600; }
.cargo__where, .cargo__next { margin: 0; font-size: var(--text-12); line-height: 1.6; }
.cargo__detail :deep(.fields) { grid-template-columns: minmax(90px, 38%) minmax(0, 1fr); column-gap: 12px; }
.cargo__detail :deep(.fields__value) { overflow-wrap: anywhere; min-width: 0; }
.cargo__detail :deep(.dcard__title) { white-space: normal; overflow: visible; }
.cargo__detail :deep(.dcard__caption) { display: block; overflow: visible; -webkit-line-clamp: unset; }
</style>
