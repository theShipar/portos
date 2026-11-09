import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATASET_KEYS, type RawDataset } from '@/core/types';
import { buildCatalog, type Catalog } from '@/data/catalog';

let cached: Catalog | null = null;

export function loadRaw(): RawDataset {
  const dir = resolve(__dirname, '../../sample-data');
  const read = (n: string) => JSON.parse(readFileSync(resolve(dir, `${n}.json`), 'utf-8'));
  const raw = { manifest: read('manifest') } as RawDataset;
  for (const k of DATASET_KEYS) (raw as unknown as Record<string, unknown>)[k] = read(k);
  return raw;
}

export function catalog(): Catalog {
  if (!cached) cached = buildCatalog(loadRaw());
  return cached;
}
