import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import { CatalogValidationError, type Catalog } from '@/data/catalog';
import { loadCatalog } from '@/data/loader';
import { buildSearchIndex, type SearchIndex } from '@/engines/search';
import { buildSpatialRegistry, type SpatialRegistry } from '@/spatial/registry';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const useCatalogStore = defineStore('catalog', () => {
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  const issues = ref<string[]>([]);
  const catalog = shallowRef<Catalog | null>(null);
  const searchIndex = shallowRef<SearchIndex | null>(null);
  /** Geographic hierarchy (earth → region → country → city → port) for scenes, routes and breadcrumbs. */
  const registry = shallowRef<SpatialRegistry | null>(null);

  async function load(): Promise<void> {
    if (status.value === 'loading' || status.value === 'ready') return;
    status.value = 'loading';
    error.value = null;
    try {
      const c = await loadCatalog();
      registry.value = markRaw(buildSpatialRegistry(c));
      catalog.value = markRaw(c);
      searchIndex.value = markRaw(buildSearchIndex(c));
      status.value = 'ready';
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
      issues.value = e instanceof CatalogValidationError ? e.issues.slice(0, 20) : [];
    }
  }

  function retry() {
    status.value = 'idle';
    return load();
  }

  /** Non-null accessor for components rendered only once the catalog is ready. */
  function require(): Catalog {
    if (!catalog.value) throw new Error('Catalog not loaded');
    return catalog.value;
  }

  return { status, error, issues, catalog, registry, searchIndex, load, retry, require };
});
