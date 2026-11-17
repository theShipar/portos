import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARGO_KEYS, type CargoModule } from '@/core/cargoTypes';
import { DATASET_KEYS, V2_KEYS, type RawDataset, type V2Module } from '@/core/types';
import { buildCatalog, type Catalog } from '@/data/catalog';

let cached: Catalog | null = null;

export function loadRaw(): RawDataset {
  const dir = resolve(__dirname, '../../sample-data');
  const read = (n: string) => JSON.parse(readFileSync(resolve(dir, `${n}.json`), 'utf-8'));
  const raw = { manifest: read('manifest') } as RawDataset;
  for (const k of DATASET_KEYS) (raw as unknown as Record<string, unknown>)[k] = read(k);
  const v2: Record<string, unknown> = {};
  for (const k of V2_KEYS) if (existsSync(resolve(dir, 'v2', `${k}.json`))) v2[k] = read(`v2/${k}`);
  raw.v2 = V2_KEYS.every((k) => k in v2) ? (v2 as unknown as V2Module) : null;
  raw.terminalOps = existsSync(resolve(dir, 'v3', 'terminalOps.json')) ? read('v3/terminalOps') : null;
  return raw;
}

export function catalog(): Catalog {
  if (!cached) cached = buildCatalog(loadRaw());
  return cached;
}

let cargoCached: CargoModule | null = null;

export function cargoModule(): CargoModule {
  if (!cargoCached) {
    const dir = resolve(__dirname, '../../sample-data/v3');
    cargoCached = Object.fromEntries(CARGO_KEYS.map((k) => [k, JSON.parse(readFileSync(resolve(dir, `${k}.json`), 'utf-8'))])) as unknown as CargoModule;
  }
  return cargoCached;
}
