<script setup lang="ts" generic="T extends string">
import { nextTick, onMounted, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    kindLabel: string;
    tabs?: { id: T; label: string }[];
    activeTab?: T;
    expanded?: boolean;
  }>(),
  { tabs: () => [], activeTab: undefined, expanded: false },
);
const emit = defineEmits<{ close: []; 'update:activeTab': [T]; 'update:expanded': [boolean] }>();

const heading = ref<HTMLElement | null>(null);
const uid = Math.random().toString(36).slice(2, 8);

function onTabKey(e: KeyboardEvent, i: number) {
  const n = props.tabs.length;
  let next = -1;
  if (e.key === 'ArrowRight') next = (i + 1) % n;
  else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  if (next < 0) return;
  e.preventDefault();
  emit('update:activeTab', props.tabs[next].id);
  nextTick(() => document.getElementById(`tab-${uid}-${props.tabs[next].id}`)?.focus());
}

onMounted(() => heading.value?.focus({ preventScroll: true }));
</script>

<template>
  <aside class="drawer panel" :class="{ 'drawer--expanded': expanded }" :aria-labelledby="`drawer-title-${uid}`" data-testid="inspector">
    <div class="drawer__head">
      <div class="drawer__titles">
        <span class="micro-label">{{ kindLabel }}</span>
        <h2 :id="`drawer-title-${uid}`" ref="heading" tabindex="-1" class="drawer__title">{{ title }}</h2>
        <slot name="subtitle" />
      </div>
      <div class="drawer__tools">
        <button type="button" class="icon-btn" :aria-label="expanded ? 'Narrow inspector' : 'Widen inspector'" :aria-pressed="expanded" @click="emit('update:expanded', !expanded)">
          <Icon :name="expanded ? 'collapse' : 'expand'" />
        </button>
        <button type="button" class="icon-btn" aria-label="Close inspector" data-testid="inspector-close" @click="emit('close')">
          <Icon name="close" />
        </button>
      </div>
    </div>
    <slot name="banner" />
    <div v-if="tabs.length" class="drawer__tabs" role="tablist" :aria-label="`${title} sections`">
      <button
        v-for="(t, i) in tabs"
        :id="`tab-${uid}-${t.id}`"
        :key="t.id"
        type="button"
        role="tab"
        class="drawer__tab"
        :aria-selected="t.id === activeTab"
        :aria-controls="`panel-${uid}`"
        :tabindex="t.id === activeTab ? 0 : -1"
        @click="emit('update:activeTab', t.id)"
        @keydown="onTabKey($event, i)"
      >
        {{ t.label }}
      </button>
    </div>
    <div :id="`panel-${uid}`" class="drawer__body" :role="tabs.length ? 'tabpanel' : undefined" :aria-labelledby="tabs.length ? `tab-${uid}-${activeTab}` : undefined">
      <slot />
    </div>
    <div v-if="$slots.footer" class="drawer__foot"><slot name="footer" /></div>
  </aside>
</template>

<style scoped>
.drawer {
  position: absolute;
  top: var(--map-control-gap);
  right: var(--map-control-gap);
  bottom: var(--map-control-gap);
  width: var(--inspector-w);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-drawer);
  z-index: 30;
  overflow: hidden;
  transition: width var(--motion-panel) var(--ease-standard);
  animation: drawer-in var(--motion-panel) var(--ease-standard);
}
.drawer--expanded {
  width: var(--inspector-w-expanded);
}
@keyframes drawer-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
}
.drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: var(--space-5) var(--space-5) var(--space-3);
}
.drawer__titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.drawer__title {
  font-size: var(--text-20);
  line-height: 28px;
  font-weight: 600;
  outline: none;
  overflow-wrap: anywhere;
}
.drawer__tools {
  display: flex;
  gap: 2px;
  margin: -4px -8px 0 0;
}
.drawer__tabs {
  display: flex;
  gap: 4px;
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--color-border);
}
.drawer__tab {
  height: 36px;
  padding: 0 8px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-ink-secondary);
  font-size: var(--text-13);
  font-weight: 500;
  margin-bottom: -1px;
}
.drawer__tab:hover {
  color: var(--color-ink);
}
.drawer__tab[aria-selected='true'] {
  color: var(--color-ink);
  border-bottom-color: var(--color-accent);
}
.drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5) var(--space-5);
}
.drawer__foot {
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  background: var(--color-panel);
}
</style>
