<script setup lang="ts">
/**
 * Model-first detail card (V3 spec 02/07 B04): media (3D preview, silhouette, stack diagram) above a title,
 * a caption of at most two lines and an optional status row. Long titles ellipsize with the full text as a tooltip.
 */
withDefaults(defineProps<{ title: string; caption?: string; eyebrow?: string; selected?: boolean }>(), { caption: '', eyebrow: '', selected: false });
</script>

<template>
  <article class="dcard" :class="{ 'dcard--selected': selected }">
    <div v-if="$slots.media" class="dcard__media"><slot name="media" /></div>
    <div class="dcard__body">
      <span v-if="eyebrow" class="dcard__eyebrow">{{ eyebrow }}</span>
      <h3 class="dcard__title" :title="title">{{ title }}</h3>
      <p v-if="caption" class="dcard__caption">{{ caption }}</p>
      <div v-if="$slots.status" class="dcard__status"><slot name="status" /></div>
      <slot />
    </div>
  </article>
</template>

<style scoped>
.dcard {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-panel-secondary);
}
.dcard--selected {
  border-color: var(--color-accent);
}
.dcard__media {
  position: relative;
  min-height: 120px;
  background: var(--color-map-ocean);
}
.dcard__body {
  display: grid;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
}
.dcard__eyebrow {
  font-size: var(--text-12);
  font-weight: 500;
  color: var(--color-ink-muted);
}
.dcard__title {
  font-size: var(--text-16);
  line-height: 22px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcard__caption {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--text-12);
  line-height: 17px;
  color: var(--color-ink-secondary);
}
.dcard__status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
</style>
