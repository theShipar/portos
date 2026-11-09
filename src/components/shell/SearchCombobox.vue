<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { PLACES } from '@/core/places';
import { sentenceCase } from '@/core/format';
import type { EntityKind } from '@/core/types';
import { search, type SearchKind, type SearchResult } from '@/engines/search';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useViewStore } from '@/stores/view';
import Icon, { type IconName } from '@/components/ui/Icon.vue';

const catalog = useCatalogStore();
const view = useViewStore();
const nav = useNavigation();

const input = ref<HTMLInputElement | null>(null);
const query = ref('');
const open = ref(false);
const active = ref(0);
const listId = 'global-search-results';

const KIND_META: Record<SearchKind, { label: string; icon: IconName }> = {
  port: { label: 'Ports', icon: 'port' },
  place: { label: 'Places', icon: 'place' },
  vessel: { label: 'Vessels', icon: 'ship' },
  voyage: { label: 'Voyages', icon: 'voyage' },
  incident: { label: 'Incidents', icon: 'incident' },
  region: { label: 'Regions', icon: 'region' },
  route: { label: 'Corridors', icon: 'route' },
};

const results = computed<SearchResult[]>(() => (catalog.searchIndex ? search(catalog.searchIndex, query.value, 10) : []));

/** Grouped for display; flat order (used for arrow keys) follows the group order. */
const groups = computed(() => {
  const map = new Map<SearchKind, SearchResult[]>();
  for (const r of results.value) map.set(r.kind, [...(map.get(r.kind) ?? []), r]);
  return [...map.entries()].map(([kind, items]) => ({ kind, items }));
});
const flat = computed(() => groups.value.flatMap((g) => g.items));
const optionId = (i: number) => `search-opt-${i}`;
const indexOf = (r: SearchResult) => flat.value.indexOf(r);

watch(query, () => {
  active.value = 0;
  open.value = query.value.trim().length > 0;
});

watch(active, () => preview());

function preview() {
  const r = flat.value[active.value];
  if (r && ['vessel', 'port', 'voyage', 'incident', 'region'].includes(r.kind)) view.setHover({ kind: r.kind as EntityKind, id: r.id });
  else view.setHover(null);
}

function choose(r: SearchResult | undefined) {
  if (!r) return;
  open.value = false;
  view.setHover(null);
  query.value = '';
  input.value?.blur();
  switch (r.kind) {
    case 'vessel':
    case 'voyage':
    case 'incident':
      nav.openEntity({ kind: r.kind, id: r.id });
      break;
    case 'port': {
      const regionId = catalog.catalog?.byId.port.get(r.id)?.regionId ?? '';
      nav.openScope({ level: 'port', portId: r.id, regionId });
      break;
    }
    case 'region':
      nav.openScope({ level: 'region', regionId: r.id });
      break;
    case 'place': {
      const place = PLACES.find((p) => p.placeId === r.id);
      if (place) nav.openScope({ level: 'region', regionId: place.regionId });
      break;
    }
    case 'route':
      view.select({ kind: 'route', id: r.id });
      break;
  }
}

function onKeydown(e: KeyboardEvent) {
  const n = flat.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    open.value = query.value.trim().length > 0;
    if (n) active.value = (active.value + 1) % n;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (n) active.value = (active.value - 1 + n) % n;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(flat.value[active.value]);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    if (open.value) open.value = false;
    else {
      query.value = '';
      input.value?.blur();
    }
    view.setHover(null);
  }
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
    view.setHover(null);
  }, 120);
}

async function focus() {
  await nextTick();
  input.value?.focus();
  input.value?.select();
}

defineExpose({ focus });
</script>

<template>
  <div class="search" :class="{ 'search--open': open }">
    <label class="sr-only" for="global-search">Search vessels, ports, voyages, incidents, regions</label>
    <Icon name="search" class="search__icon" />
    <input
      id="global-search"
      ref="input"
      v-model="query"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      placeholder="Search vessels, ports, voyages, incidents…"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="open && flat.length ? optionId(active) : undefined"
      :disabled="catalog.status !== 'ready'"
      @input="open = true"
      @keydown="onKeydown"
      @focus="open = query.trim().length > 0"
      @blur="onBlur"
    />
    <kbd v-if="!query" class="search__kbd mono" aria-hidden="true">/</kbd>
    <div v-show="open" :id="listId" class="search__panel panel" role="listbox" aria-label="Search results">
      <template v-if="flat.length">
        <div v-for="g in groups" :key="g.kind" role="group" :aria-labelledby="`search-group-${g.kind}`">
          <div :id="`search-group-${g.kind}`" class="search__group micro-label">{{ KIND_META[g.kind].label }}</div>
          <div
            v-for="r in g.items"
            :id="optionId(indexOf(r))"
            :key="`${r.kind}:${r.id}`"
            role="option"
            class="search__option"
            :class="{ 'is-active': indexOf(r) === active }"
            :aria-selected="indexOf(r) === active"
            @mousedown.prevent="choose(r)"
            @mousemove="active = indexOf(r)"
          >
            <Icon :name="KIND_META[r.kind].icon" class="search__opt-icon" />
            <div class="search__opt-text">
              <div class="search__opt-title">{{ r.title }}</div>
              <div class="search__opt-sub">
                <span>{{ r.subtitle }}</span>
                <span v-if="r.status" class="search__opt-status">· {{ sentenceCase(r.status) }}</span>
              </div>
            </div>
            <span class="search__opt-match">{{ r.matchReason }}</span>
          </div>
        </div>
      </template>
      <div v-else class="search__empty">
        <strong>No match in simulated dataset</strong>
        <span>Try a vessel name, a port, an ID such as VSL-0001 or INC-0001, or a region.</span>
      </div>
      <div class="search__foot">Local search over synthetic fixture data · ↑↓ to move · Enter to open · Esc to close</div>
    </div>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  width: min(520px, 100%);
}
.search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-ink-muted);
  pointer-events: none;
}
input {
  width: 100%;
  height: 36px;
  padding: 0 36px 0 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel-secondary);
  font-size: var(--text-13);
  transition: border-color var(--motion-hover), background var(--motion-hover);
}
input::placeholder {
  color: var(--color-ink-muted);
}
input:hover {
  border-color: var(--color-border-strong);
}
input:focus {
  background: var(--color-panel);
  border-color: var(--color-accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}
.search__kbd {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-chip);
  background: var(--color-panel);
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  line-height: 18px;
  text-align: center;
}
.search__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  padding: 6px;
  box-shadow: var(--shadow-drawer);
}
.search__group {
  padding: 8px 8px 4px;
}
.search__option {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-input);
  cursor: pointer;
}
.search__option.is-active {
  background: var(--color-accent-subtle);
}
.search__opt-icon {
  color: var(--color-ink-secondary);
}
.search__option.is-active .search__opt-icon {
  color: var(--color-accent-ink);
}
.search__opt-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search__opt-sub {
  font-size: var(--text-12);
  line-height: 16px;
  color: var(--color-ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search__opt-text {
  min-width: 0;
}
.search__opt-match {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.search__empty {
  display: grid;
  gap: 4px;
  padding: 16px 12px;
  color: var(--color-ink-secondary);
}
.search__empty strong {
  color: var(--color-ink);
  font-weight: 600;
}
.search__foot {
  margin-top: 4px;
  padding: 8px 8px 4px;
  border-top: 1px solid var(--color-border);
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>
