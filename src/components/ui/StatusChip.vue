<script setup lang="ts">
import type { StatusStyle } from '@/styles/tokens';
import Icon from './Icon.vue';

withDefaults(defineProps<{ status: StatusStyle; label?: string; dense?: boolean }>(), { label: undefined, dense: false });
</script>

<template>
  <span class="chip" :class="[`chip--${status.tone}`, { 'chip--dense': dense }]">
    <Icon :name="status.icon" :size="dense ? 12 : 14" />
    <span>{{ label ?? status.label }}</span>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-chip);
  font-size: var(--text-12);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.chip--dense {
  height: 20px;
  padding: 0 6px;
  font-size: var(--text-11);
}
.chip--healthy {
  background: var(--color-healthy-subtle);
  color: var(--color-healthy);
}
.chip--warning {
  background: var(--color-warning-subtle);
  color: var(--color-warning-ink);
}
.chip--critical {
  background: var(--color-critical-subtle);
  color: var(--color-critical);
}
.chip--info {
  background: var(--color-info-subtle);
  color: var(--color-info);
}
.chip--unknown {
  background: var(--color-unknown-subtle);
  color: var(--color-unknown-ink);
}
.chip--selected {
  background: var(--color-accent-subtle);
  color: var(--color-accent-ink);
}
.chip--neutral {
  background: var(--color-panel-secondary);
  color: var(--color-ink-secondary);
}
</style>
