<script setup lang="ts">
import { computed } from 'vue';
import { parentScope, scopeKey, scopeTrail, type Scope } from '@/core/scope';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

const catalog = useCatalogStore();
const view = useViewStore();
const nav = useNavigation();

function scopeLabel(s: Scope): string {
  const c = catalog.catalog;
  if (s.level === 'earth') return 'Earth';
  if (s.level === 'region') return c?.byId.region.get(s.regionId)?.name ?? s.regionId;
  return c?.byId.port.get(s.portId)?.name ?? s.portId;
}

const entityLabel = computed(() => {
  const sel = view.selection;
  const c = catalog.catalog;
  if (!sel || !c) return null;
  if (sel.kind === 'vessel') return c.byId.vessel.get(sel.id)?.name ?? sel.id;
  if (sel.kind === 'incident') return `Incident ${sel.id}`;
  if (sel.kind === 'voyage') return `Voyage ${sel.id}`;
  if (sel.kind === 'route') return c.byId.route.get(sel.id)?.corridorName ?? sel.id;
  return sel.id;
});

const trail = computed(() => scopeTrail(view.scope));
const canGoUp = computed(() => !!view.selection || view.scope.level !== 'earth');

function up() {
  if (view.selection) nav.closeSelection();
  else {
    const p = parentScope(view.scope);
    if (p) nav.openScope(p);
  }
}

defineExpose({ up, canGoUp });
</script>

<template>
  <nav class="crumbs" aria-label="Geographic scope">
    <button type="button" class="icon-btn crumbs__back" :disabled="!canGoUp" aria-label="Up one level (Backspace)" title="Up one level (Backspace)" @click="up">
      <Icon name="arrow-left" :size="15" />
    </button>
    <ol>
      <li v-for="(s, i) in trail" :key="scopeKey(s)">
        <Icon v-if="i > 0" name="chevron-right" :size="12" class="crumbs__sep" />
        <button v-if="i < trail.length - 1 || entityLabel" type="button" class="crumbs__link" @click="nav.openScope(s)">
          <Icon v-if="s.level === 'earth'" name="globe" :size="13" />{{ scopeLabel(s) }}
        </button>
        <span v-else class="crumbs__current" aria-current="location"><Icon v-if="s.level === 'earth'" name="globe" :size="13" />{{ scopeLabel(s) }}</span>
      </li>
      <li v-if="entityLabel">
        <Icon name="chevron-right" :size="12" class="crumbs__sep" />
        <span class="crumbs__current" aria-current="page">{{ entityLabel }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.crumbs {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 10px 0 2px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  max-width: 100%;
}
.crumbs__back {
  width: 30px;
  height: 30px;
}
.crumbs__back:disabled {
  opacity: 0.35;
}
ol {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
  border-left: 1px solid var(--color-border);
  min-width: 0;
}
li {
  display: flex;
  align-items: center;
  min-width: 0;
}
.crumbs__sep {
  color: var(--color-ink-muted);
  margin: 0 2px;
  flex: none;
}
.crumbs__link,
.crumbs__current {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: none;
  border-radius: var(--radius-chip);
  background: none;
  font-size: var(--text-13);
  white-space: nowrap;
}
.crumbs__link {
  color: var(--color-ink-secondary);
}
.crumbs__link:hover {
  background: var(--color-panel-secondary);
  color: var(--color-ink);
}
.crumbs__current {
  font-weight: 600;
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
