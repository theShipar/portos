<script setup lang="ts" generic="T extends string">
import Icon, { type IconName } from './Icon.vue';

export interface SegmentOption<V extends string> {
  id: V;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  title?: string;
  testid?: string;
}

/** Toggle-button group (V3 spec 02/08): one pressed segment, arrow keys move between enabled segments. */
const props = withDefaults(defineProps<{ options: SegmentOption<T>[]; modelValue: T | null; label: string; size?: 'sm' | 'md'; iconOnly?: boolean }>(), { size: 'md', iconOnly: false });
const emit = defineEmits<{ 'update:modelValue': [T] }>();

function pick(o: SegmentOption<T>) {
  if (!o.disabled && o.id !== props.modelValue) emit('update:modelValue', o.id);
}

function onKey(e: KeyboardEvent, i: number) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const n = props.options.length;
  const step = e.key === 'ArrowRight' ? 1 : -1;
  for (let k = 1; k <= n; k++) {
    const o = props.options[(i + step * k + n * k) % n];
    if (!o.disabled) {
      e.preventDefault();
      pick(o);
      ((e.currentTarget as HTMLElement).parentElement?.children[props.options.indexOf(o)] as HTMLElement | undefined)?.focus();
      return;
    }
  }
}
</script>

<template>
  <div class="seg" :class="`seg--${size}`" role="group" :aria-label="label">
    <button
      v-for="(o, i) in options"
      :key="o.id"
      type="button"
      class="seg__btn"
      :aria-pressed="modelValue === o.id"
      :aria-label="iconOnly ? o.label : undefined"
      :disabled="o.disabled"
      :title="o.title ?? (iconOnly ? o.label : undefined)"
      :data-testid="o.testid"
      @click="pick(o)"
      @keydown="onKey($event, i)"
    >
      <Icon v-if="o.icon" :name="o.icon" :size="size === 'sm' ? 14 : 16" />
      <span v-if="!iconOnly">{{ o.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 2px;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-input);
  box-shadow: var(--shadow-panel);
}
.seg__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--radius-input) - 2px);
  background: transparent;
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  font-weight: 500;
  transition: background var(--motion-hover), color var(--motion-hover);
}
.seg--sm .seg__btn {
  height: 28px;
  padding: 0 8px;
}
.seg__btn:hover:not(:disabled):not([aria-pressed='true']) {
  background: var(--color-hover);
  color: var(--color-ink);
}
.seg__btn[aria-pressed='true'] {
  background: var(--toggle-on-bg);
  color: var(--toggle-on-ink);
}
.seg__btn:disabled {
  color: var(--color-ink-muted);
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
