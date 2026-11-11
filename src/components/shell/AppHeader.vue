<script setup lang="ts">
import { ref } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import ActivityHub from '@/features/workflow/ActivityHub.vue';
import ResetDialog from '@/features/workflow/ResetDialog.vue';
import SearchCombobox from './SearchCombobox.vue';
import SimulationStamp from './SimulationStamp.vue';
import UserMenu from './UserMenu.vue';

const nav = useNavigation();
const catalog = useCatalogStore();
const search = ref<InstanceType<typeof SearchCombobox> | null>(null);

defineExpose({ focusSearch: () => search.value?.focus() });
</script>

<template>
  <header class="header">
    <a class="brand" href="/ops/earth" aria-label="PORTOS — global operations view" @click.prevent="nav.home()">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="6" fill="var(--color-ink)" />
        <path d="M6 16.5h14l-1.6 3.5H7.6L6 16.5Z" fill="var(--color-accent)" />
        <path d="M8 15.5v-4l5-2.2 5 2.2v4M13 9.3V5.5" stroke="var(--color-app)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
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
      <ActivityHub v-if="catalog.status === 'ready'" />
      <ResetDialog v-if="catalog.status === 'ready'" />
      <span class="divider" aria-hidden="true" />
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) auto;
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
@media (max-width: 1200px) {
  .header {
    gap: var(--space-3);
    padding: 0 var(--space-4);
  }
  .header__right {
    gap: var(--space-2);
  }
  .header :deep(.compact-label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
@media (max-width: 900px) {
  .brand__name,
  .divider {
    display: none;
  }
  .header :deep(.user__label) {
    display: none;
  }
}
@media (max-width: 767px) {
  .header :deep(.stamp__text),
  .header :deep(.search__kbd) {
    display: none;
  }
}
/* Phone (V3 spec 02/06, 08/01): 56 px bar; search shrinks to its icon and expands across the bar while focused. */
@media (max-width: 479px) {
  .header {
    grid-template-columns: auto minmax(44px, 1fr) auto;
    gap: var(--space-2);
    padding: 0 var(--space-3);
  }
  .header__right {
    gap: 2px;
  }
  .header :deep(.search input) {
    height: 40px;
    padding-right: 8px;
  }
  .header :deep(.search input::placeholder) {
    color: transparent;
  }
  .header__center:focus-within {
    position: absolute;
    inset: 8px var(--space-3);
    z-index: 5;
  }
  .header__center:focus-within :deep(.search) {
    width: 100%;
  }
  .header__center:focus-within :deep(.search input::placeholder) {
    color: var(--color-ink-muted);
  }
  .header :deep(.stamp__btn) {
    gap: 4px;
    padding: 0 4px;
  }
}
</style>
