<script setup lang="ts">
import { ref } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import SearchCombobox from './SearchCombobox.vue';
import SimulationStamp from './SimulationStamp.vue';
import UserMenu from './UserMenu.vue';

const nav = useNavigation();
const search = ref<InstanceType<typeof SearchCombobox> | null>(null);

defineExpose({ focusSearch: () => search.value?.focus() });
</script>

<template>
  <header class="header">
    <a class="brand" href="/operations" aria-label="PORTOS — global operations view" @click.prevent="nav.home()">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="6" fill="var(--color-ink)" />
        <path d="M6 16.5h14l-1.6 3.5H7.6L6 16.5Z" fill="var(--color-accent)" />
        <path d="M8 15.5v-4l5-2.2 5 2.2v4M13 9.3V5.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="brand__name">PORTOS</span>
      <span class="brand__tag">Maritime exceptions</span>
    </a>
    <div class="header__center">
      <SearchCombobox ref="search" />
    </div>
    <div class="header__right">
      <SimulationStamp />
      <span class="divider" aria-hidden="true" />
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 480px) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  height: var(--shell-header-h);
  padding: 0 var(--space-5);
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  z-index: 40;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-ink);
  text-decoration: none;
  justify-self: start;
  border-radius: var(--radius-input);
}
.brand__name {
  font-size: var(--text-16);
  font-weight: 700;
  letter-spacing: 0.06em;
}
.brand__tag {
  font-size: var(--text-12);
  color: var(--color-ink-muted);
  padding-left: 10px;
  border-left: 1px solid var(--color-border);
}
.header__center {
  display: flex;
  justify-content: center;
}
.header__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}
.divider {
  width: 1px;
  height: 28px;
  background: var(--color-border);
}
@media (max-width: 1360px) {
  .brand__tag {
    display: none;
  }
}
</style>
