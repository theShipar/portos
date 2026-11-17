import { flags } from '@/core/flags';
import type { TerminalOpsModule } from '@/core/terminalTypes';
import { DATASET_KEYS, V2_KEYS, type RawDataset, type V2Module } from '@/core/types';
import { buildCatalog, type Catalog } from './catalog';

const urls = import.meta.glob(['../../sample-data/*.json', '../../sample-data/v2/*.json', '../../sample-data/v3/terminalOps.json'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<
  string,
  string
>;

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

/** Datasets the app can run without: a missing weather feed makes route risk "unknown", never "clear". */
const OPTIONAL_DATASETS: ReadonlySet<string> = new Set(['weatherHazards']);

/** The V2 scenario module loads as one unit; if any file fails the app falls back to the base fixture and says so. */
async function loadV2(signal?: AbortSignal): Promise<V2Module | null> {
  try {
    const parts = await Promise.all(V2_KEYS.map((k) => fetchJson<unknown>(`v2/${k}`, signal)));
    return Object.fromEntries(V2_KEYS.map((k, i) => [k, parts[i]])) as unknown as V2Module;
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  }
}

/** V3 typed terminals (~20 KB) load with the catalog under `v3PortTwin`; without them the V2 twins stay as they were. */
async function loadTerminalOps(signal?: AbortSignal): Promise<TerminalOpsModule | null> {
  if (!flags.v3PortTwin) return null;
  try {
    return await fetchJson<TerminalOpsModule>('v3/terminalOps', signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  }
}

/** Load every fixture, validate references and return the immutable catalog. */
export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const missing: string[] = [];
  const optional = (k: string) => (e: unknown) => {
    if (!OPTIONAL_DATASETS.has(k) || signal?.aborted) throw e;
    missing.push(k);
    return [];
  };
  const [manifest, v2, terminalOps, ...rows] = await Promise.all([
    fetchJson<RawDataset['manifest']>('manifest', signal),
    loadV2(signal),
    loadTerminalOps(signal),
    ...DATASET_KEYS.map((k) => fetchJson<unknown[]>(k, signal).catch(optional(k))),
  ]);
  if (!v2) missing.push('v2');
  if (flags.v3PortTwin && !terminalOps) missing.push('v3/terminalOps');
  const raw = { manifest, v2, terminalOps } as RawDataset;
  DATASET_KEYS.forEach((k, i) => {
    (raw as unknown as Record<string, unknown>)[k] = rows[i];
  });
  return buildCatalog(raw, missing);
}
