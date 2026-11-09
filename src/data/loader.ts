import { DATASET_KEYS, type RawDataset } from '@/core/types';
import { buildCatalog, type Catalog } from './catalog';

const urls = import.meta.glob('../../sample-data/*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

function urlFor(name: string): string {
  const entry = Object.entries(urls).find(([path]) => path.endsWith(`/${name}.json`));
  if (!entry) throw new Error(`Fixture ${name}.json is not bundled`);
  return entry[1];
}

async function fetchJson<T>(name: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(urlFor(name), { signal });
  if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
  return (await res.json()) as T;
}

/** Load every fixture, validate references and return the immutable catalog. */
export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const [manifest, ...rows] = await Promise.all([
    fetchJson<RawDataset['manifest']>('manifest', signal),
    ...DATASET_KEYS.map((k) => fetchJson<unknown[]>(k, signal)),
  ]);
  const raw = { manifest } as RawDataset;
  DATASET_KEYS.forEach((k, i) => {
    (raw as unknown as Record<string, unknown>)[k] = rows[i];
  });
  return buildCatalog(raw);
}
