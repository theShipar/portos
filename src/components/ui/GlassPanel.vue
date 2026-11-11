<script setup lang="ts">
/**
 * Glass material (V3 spec 02/05). Tiers: `hud` compact floating chips, `inspector` denser for long text,
 * `popover` menus. The blur sits on this element's own backplate only; the WebGL canvas is never filtered.
 */
withDefaults(defineProps<{ tier?: 'hud' | 'inspector' | 'popover'; pad?: 'none' | 'sm' | 'md'; as?: string }>(), { tier: 'hud', pad: 'md', as: 'div' });
</script>

<template>
  <component :is="as" class="glass-panel" :class="[`glass-panel--${tier}`, `glass-panel--pad-${pad}`]">
    <slot />
  </component>
</template>

<style scoped>
.glass-panel {
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  color: var(--color-ink);
}
.glass-panel--inspector {
  background: var(--surface-inspector);
}
.glass-panel--popover {
  background: var(--surface-popover);
  border-radius: var(--radius-card);
}
.glass-panel--pad-sm {
  padding: var(--space-3);
}
.glass-panel--pad-md {
  padding: var(--space-5);
}
@media (max-width: 1023px) {
  .glass-panel--pad-md {
    padding: var(--space-4);
  }
}
</style>
