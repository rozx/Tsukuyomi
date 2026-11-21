import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_PROVIDERS,
  MODELS_DEV_API_URL,
  buildLimitsCatalog,
  normalizeModelId,
  positiveLimit,
} from '../src/services/ai/model-limits/catalog-types';
import type {
  CatalogEntry,
  ModelsDevDatabase,
} from '../src/services/ai/model-limits/catalog-types';

const response = await fetch(MODELS_DEV_API_URL);
if (!response.ok) throw new Error(`模型目录下载失败：HTTP ${response.status}`);
const catalog: Record<string, Record<string, CatalogEntry>> = buildLimitsCatalog(
  (await response.json()) as ModelsDevDatabase,
);
if (JSON.stringify(catalog).length > 300_000) {
  const fallback: Record<string, CatalogEntry> = {};
  for (const [provider, models] of Object.entries(catalog)) {
    if ((CATALOG_PROVIDERS as readonly string[]).includes(provider)) continue;
    for (const [name, [context, output, input]] of Object.entries(models)) {
      const id = normalizeModelId(name);
      const previous = fallback[id];
      const outputs = [previous?.[1], output].filter(
        (value): value is number => positiveLimit(value) !== undefined,
      );
      fallback[id] = [
        Math.min(previous?.[0] ?? Infinity, context, input ?? context),
        outputs.length ? Math.min(...outputs) : 0,
      ];
    }
    delete catalog[provider];
  }
  catalog._fallback = Object.fromEntries(
    Object.entries(fallback).sort(([a], [b]) => a.localeCompare(b)),
  );
}
const directory = fileURLToPath(new URL('../src/services/ai/model-limits/', import.meta.url));
await mkdir(directory, { recursive: true });
const json = JSON.stringify(catalog) + '\n';
await writeFile(`${directory}catalog.json`, json);
console.log(
  JSON.stringify({
    bytes: Buffer.byteLength(json),
    providers: Object.keys(catalog).length,
    models: Object.values(catalog).reduce((sum, models) => sum + Object.keys(models).length, 0),
  }),
);
