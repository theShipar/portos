<script setup lang="ts">
import type { InspectorField } from '@/selectors/vessel';
import ProvenanceButton from './ProvenanceButton.vue';

defineProps<{ fields: InspectorField[] }>();
</script>

<template>
  <dl class="fields">
    <template v-for="f in fields" :key="f.label">
      <dt>{{ f.label }}</dt>
      <dd>
        <span class="fields__value">
          <span :class="{ mono: f.mono }">{{ f.value }}</span>
          <ProvenanceButton v-if="f.provenance" :provenance="f.provenance" :label="f.label" />
        </span>
        <span v-if="f.hint" class="fields__hint">{{ f.hint }}</span>
      </dd>
    </template>
  </dl>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: minmax(120px, 40%) 1fr;
  margin: 0;
}
dt,
dd {
  padding: 7px 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--text-12);
  line-height: 18px;
}
dt {
  color: var(--color-ink-secondary);
}
dd {
  margin: 0;
  color: var(--color-ink);
  display: grid;
}
.fields__value {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.fields__hint {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>
