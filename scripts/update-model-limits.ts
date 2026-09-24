import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_PROVIDERS,
  normalizeModelId,
  positiveLimit,
} from '../src/services/ai/model-limits/catalog-types';
import type { CatalogEntry } from '../src/services/ai/model-limits/catalog-types';

type Database = Record<
  string,
  { models?: Record<string, { limit?: { context?: number; output?: number; input?: number } }> }
>;
const response = await fetch('https://models.dev/api.json');
if (!response.ok) throw new Error(`模型目录下载失败：HTTP ${response.status}`);
const data = (await response.json()) as Database;
const catalog: Record<string, Record<string, CatalogEntry>> = {};
for (const provider of Object.keys(data).sort()) {
  const models: Record<string, CatalogEntry> = {};
  for (const [id, model] of Object.entries(data[provider]?.models ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const context = positiveLimit(model.limit?.context);
    if (!context) continue;
    const input = positiveLimit(model.limit?.input);
    models[id] = input
      ? [context, positiveLimit(model.limit?.output) ?? 0, input]
      : [context, positiveLimit(model.limit?.output) ?? 0];
  }
  if (Object.keys(models).length) catalog[provider] = models;
}
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
