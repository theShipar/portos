<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useNavigation, useRouteSync } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import AppHeader from '@/components/shell/AppHeader.vue';
import KpiRow from '@/components/shell/KpiRow.vue';
import NoticeStack from '@/components/shell/NoticeStack.vue';
import EntityInspector from '@/features/inspectors/EntityInspector.vue';
import TempCanvasMap from '@/map/TempCanvasMap.vue';

const catalog = useCatalogStore();
const clock = useClockStore();
const view = useViewStore();
const snap = useSnapshotStore();
const notices = useNoticeStore();
const nav = useNavigation();
const header = ref<InstanceType<typeof AppHeader> | null>(null);

useRouteSync();

watch(
  () => catalog.catalog,
  (c) => {
    if (c) clock.configure({ anchorMs: c.anchorMs, startMs: c.replayStartMs, dataVersion: c.manifest.version });
  },
  { immediate: true },
);

if (view.storageWarning) notices.push(view.storageWarning, 'warning');

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function onKey(e: KeyboardEvent) {
  if ((e.key === '/' && !isTyping(e.target)) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    header.value?.focusSearch();
  } else if (e.key === 'Escape' && !isTyping(e.target) && view.selection) {
    nav.closeSelection();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#global-search">Skip to search</a>
    <AppHeader ref="header" />
    <main class="workspace" aria-label="Operations map workspace">
      <TempCanvasMap v-if="catalog.status === 'ready'" />
      <div v-if="catalog.status === 'ready'" class="overlay overlay--tl">
        <KpiRow :kpis="snap.globalKpis" />
      </div>
      <EntityInspector v-if="catalog.status === 'ready'" />
      <div v-if="catalog.status === 'loading' || catalog.status === 'idle'" class="state" role="status">
        <div class="state__spinner" aria-hidden="true" />
        <span>Loading simulated dataset…</span>
      </div>
      <div v-else-if="catalog.status === 'error'" class="state state--error" role="alert">
        <strong>The simulated dataset could not be loaded.</strong>
        <span>{{ catalog.error }}</span>
        <ul v-if="catalog.issues.length" class="state__issues mono">
          <li v-for="i in catalog.issues" :key="i">{{ i }}</li>
        </ul>
        <button type="button" class="btn btn--primary" @click="catalog.retry()">Retry loading</button>
      </div>
      <NoticeStack />
    </main>
    <RouterView />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: var(--shell-header-h) 1fr;
  height: 100%;
}
.workspace {
  position: relative;
  overflow: hidden;
  background: var(--color-map-ocean);
}
.overlay {
  position: absolute;
  z-index: 20;
}
.overlay--tl {
  top: var(--map-control-gap);
  left: var(--map-control-gap);
}
.state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: var(--color-ink-on-dark);
  text-align: center;
}
.state--error {
  background: var(--color-app);
  color: var(--color-ink);
  max-width: none;
}
.state__issues {
  max-width: 640px;
  text-align: left;
  font-size: var(--text-12);
  color: var(--color-critical);
}
.state__spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--color-accent);
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.skip-link {
  position: absolute;
  left: 8px;
  top: -40px;
  z-index: 100;
  padding: 8px 12px;
  background: var(--color-panel);
  border-radius: var(--radius-input);
}
.skip-link:focus {
  top: 8px;
}
</style>
