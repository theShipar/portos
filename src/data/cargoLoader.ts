import { CARGO_KEYS, type CargoModule } from '@/core/cargoTypes';

const urls = import.meta.glob('../../sample-data/v3/*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/**
 * The V3 cargo module (~1.2 MB) loads on demand, the first time a vessel inspector needs it, and as one unit:
 * if any file fails the inspector says cargo is unavailable instead of showing a partial manifest.
 */
export async function loadCargoModule(signal?: AbortSignal): Promise<CargoModule> {
  const parts = await Promise.all(
    CARGO_KEYS.map(async (k) => {
      const entry = Object.entries(urls).find(([path]) => path.endsWith(`/v3/${k}.json`));
      if (!entry) throw new Error(`Fixture v3/${k}.json is not bundled`);
      const res = await fetch(entry[1], { signal });
      if (!res.ok) throw new Error(`Failed to load v3/${k}.json (${res.status})`);
      return res.json() as Promise<unknown>;
    }),
  );
  return Object.fromEntries(CARGO_KEYS.map((k, i) => [k, parts[i]])) as unknown as CargoModule;
}
