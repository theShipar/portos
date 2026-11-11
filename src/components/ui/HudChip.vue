<script setup lang="ts">
import type { StatusTone } from '@/styles/tokens';

/**
 * Floating HUD metric chip (V3 spec 02/07): label, tabular value with its unit attached, one caption line.
 * Renders as a button when `pressable` so a chip can open its report; otherwise as static text.
 */
withDefaults(
  defineProps<{ label: string; value: string; unit?: string; caption?: string; tone?: StatusTone; pressable?: boolean; pressed?: boolean; testid?: string }>(),
  { unit: '', caption: '', tone: 'neutral', pressable: false, pressed: false, testid: undefined },
);
defineEmits<{ press: [] }>();
</script>

<template>
  <component
    :is="pressable ? 'button' : 'div'"
    :type="pressable ? 'button' : undefined"
    class="hud-chip"
    :class="[`hud-chip--${tone}`, { 'hud-chip--pressable': pressable }]"
    :aria-pressed="pressable ? pressed : undefined"
    :data-testid="testid"
    @click="pressable && $emit('press')"
  >
    <span class="hud-chip__label">{{ label }}</span>
    <span class="hud-chip__value num">
      {{ value }}<span v-if="unit" class="hud-chip__unit">{{ unit }}</span>
    </span>
    <span v-if="caption" class="hud-chip__caption">{{ caption }}</span>
  </component>
</template>

<style scoped>
.hud-chip {
  display: grid;
  align-content: start;
  gap: 2px;
  min-width: 96px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-card);
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  color: var(--color-ink);
  text-align: left;
}
.hud-chip--pressable {
  cursor: pointer;
  transition: border-color var(--motion-hover), background var(--motion-hover);
}
.hud-chip--pressable:hover {
  border-color: var(--color-border-strong);
}
.hud-chip[aria-pressed='true'] {
  border-color: var(--color-accent);
}
.hud-chip__label {
  font-size: var(--text-12);
  font-weight: 500;
  color: var(--color-ink-secondary);
}
.hud-chip__value {
  font-size: var(--text-20);
  line-height: 1.2;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.hud-chip__unit {
  margin-left: 3px;
  font-size: var(--text-12);
  font-weight: 500;
  color: var(--color-ink-secondary);
}
.hud-chip__caption {
  font-size: var(--text-12);
  color: var(--color-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hud-chip--critical .hud-chip__value {
  color: var(--color-critical);
}
.hud-chip--warning .hud-chip__value {
  color: var(--color-warning-ink);
}
.hud-chip--healthy .hud-chip__value {
  color: var(--color-healthy);
}
</style>
