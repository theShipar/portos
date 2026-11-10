<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useNavigation, useRouteSync } from '@/router/useRouteSync';
import { useAssumptionStore } from '@/stores/assumptions';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useNoticeStore } from '@/stores/notices';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import AppHeader from '@/components/shell/AppHeader.vue';
import KpiRow from '@/components/shell/KpiRow.vue';
import NoticeStack from '@/components/shell/NoticeStack.vue';
import PortKpiRow from '@/components/shell/PortKpiRow.vue';
import BerthCard from '@/features/port/BerthCard.vue';
import BerthGantt from '@/features/port/BerthGantt.vue';
import PortQueueShelf from '@/features/port/PortQueueShelf.vue';
import IncidentQueue from '@/features/workflow/IncidentQueue.vue';
import ScopeBreadcrumb from '@/components/shell/ScopeBreadcrumb.vue';
import EntityInspector from '@/features/inspectors/EntityInspector.vue';
import MapWorkspace from '@/map/MapWorkspace.vue';
import ReplayRail from '@/features/replay/ReplayRail.vue';

const catalog = useCatalogStore();
const clock = useClockStore();
const view = useViewStore();
const snap = useSnapshotStore();
const notices = useNoticeStore();
const assumptions = useAssumptionStore();
const workflow = useWorkflowStore();
const nav = useNavigation();
const header = ref<InstanceType<typeof AppHeader> | null>(null);
const crumbs = ref<InstanceType<typeof ScopeBreadcrumb> | null>(null);
const railOpen = computed(() => catalog.status === 'ready' && (view.replayOpen || clock.mode === 'replay'));
/** Port-scope panels avoid the queue shelf (left) and the inspector (right). */
const workspaceVars = computed(() => ({
  '--shelf-w': snap.portView ? (view.queueShelfOpen ? '340px' : '220px') : '0px',
  '--card-right': view.inspectorOpen && !view.sheetLayout ? 'calc(var(--inspector-w) + var(--map-control-gap))' : '0px',
  '--gantt-right': view.inspectorOpen && !view.sheetLayout ? 'calc(var(--inspector-w) + 96px)' : '84px',
}));

useRouteSync();

watch(
  () => catalog.catalog,
  (c) => {
    if (c) clock.configure({ anchorMs: c.anchorMs, startMs: c.replayStartMs, dataVersion: c.manifest.version });
    if (c?.missingDatasets.includes('weatherHazards'))
      notices.push('Weather hazard data could not be loaded. Route risk reads "unknown" (not clear) until it is available; reload to retry.', 'warning', { persistent: true });
  },
  { immediate: true },
);

// Reset saved work must stay visible until dismissed; first load can outlast a timed toast.
for (const w of [view.storageWarning, assumptions.storageWarning, workflow.storageWarning]) if (w) notices.push(w, 'warning', { persistent: true });

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function onKey(e: KeyboardEvent) {
  if ((e.key === '/' && !isTyping(e.target)) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    header.value?.focusSearch();
  } else if (e.key === 'Escape' && !e.defaultPrevented && !isTyping(e.target) && view.selection) {
    e.preventDefault();
    nav.closeSelection();
  } else if (e.key === 'Backspace' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    crumbs.value?.up();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#global-search">Skip to search</a>
    <AppHeader ref="header" />
    <main class="workspace" :class="{ 'workspace--rail': railOpen, 'workspace--inspector': view.inspectorOpen }" :style="workspaceVars" aria-label="Operations map workspace">
      <p class="narrow-note" role="note">The map needs a window at least 768 px wide. Cases, search and the inspector still work here.</p>
      <MapWorkspace v-if="catalog.status === 'ready'" />
      <div v-if="catalog.status === 'ready'" class="overlay overlay--tl">
        <ScopeBreadcrumb ref="crumbs" />
        <PortKpiRow v-if="snap.portView" :vm="snap.portView" />
        <KpiRow v-else :kpis="snap.kpis" />
        <PortQueueShelf v-if="snap.portView" />
        <IncidentQueue v-else />
      </div>
      <BerthGantt v-if="catalog.status === 'ready' && snap.portTwin" />
      <BerthCard v-if="catalog.status === 'ready' && snap.portTwin && view.berthId && view.viewMode === '3d'" />
      <EntityInspector v-if="catalog.status === 'ready'" />
      <ReplayRail v-if="railOpen" />
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
  --rail-h: 148px;
  --rail-lift: 0px;
  --drawer-bottom: var(--map-control-gap);
  --sheet-h: 46%;
  --sheet-top: calc(var(--drawer-bottom) + var(--sheet-h) + 8px);
  position: relative;
  overflow: hidden;
  background: var(--color-map-ocean);
}
.workspace--rail {
  --rail-lift: calc(var(--rail-h) + 8px);
  --drawer-bottom: calc(var(--rail-h) + 44px);
}
.overlay {
  position: absolute;
  z-index: 20;
}
.overlay--tl {
  top: var(--map-control-gap);
  left: var(--map-control-gap);
  bottom: calc(40px + var(--rail-lift));
  display: grid;
  grid-template-rows: auto auto minmax(0, auto);
  align-content: start;
  justify-items: start;
  gap: 8px;
  pointer-events: none;
}
.overlay--tl > :deep(*) {
  pointer-events: auto;
}
.narrow-note {
  display: none;
}
@media (max-width: 1100px) {
  .workspace {
    --rail-h: 290px;
  }
}
@media (max-width: 1024px) {
  .workspace--rail {
    --sheet-h: 30%;
  }
  .workspace--inspector .overlay--tl {
    bottom: var(--sheet-top);
  }
}
@media (max-width: 767px) {
  .workspace {
    --sheet-h: 62%;
    background: var(--color-app);
  }
  .workspace :deep(.workspace-map) {
    visibility: hidden;
  }
  /* Map labels set inline visibility every frame. */
  .workspace :deep(.workspace-map *) {
    visibility: hidden !important;
  }
  .narrow-note {
    display: block;
    position: absolute;
    top: var(--map-control-gap);
    left: var(--map-control-gap);
    right: var(--map-control-gap);
    z-index: 21;
    margin: 0;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-info-subtle);
    color: var(--color-ink);
    font-size: var(--text-12);
  }
  .overlay--tl {
    top: 64px;
    right: var(--map-control-gap);
    justify-items: stretch;
  }
  .overlay--tl > :deep(*) {
    max-width: 100%;
    overflow-x: auto;
  }
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
