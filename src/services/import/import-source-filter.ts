import type { ImportSourceFilter } from 'src/models/import-pattern';
import { ImportRepository } from './import-repository';
import { filterImportItems } from './import-pattern-filter';

export async function filterImportSourceIds(
  taskId: string,
  ids: string[],
  kind: 'source' | 'discovery',
  filter?: ImportSourceFilter,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!filter) return ids;
  const items = [];
  for (const id of ids) {
    if (kind === 'source') {
      const source = await ImportRepository.getActiveSource(taskId, id);
      items.push({
        id,
        name: source.name,
        locator: source.url ?? source.relativePath ?? source.name,
      });
    } else {
      const resource = await ImportRepository.getResource(taskId, id);
      if (resource?.kind !== 'discovery')
        throw new Error('SOURCE_SCOPE: 发现引用不存在或不属于当前任务');
      const discovery = resource.discovery;
      items.push({ id, name: discovery.name, locator: discovery.locator });
    }
  }
  const result = await filterImportItems(
    items,
    [
      { pattern: filter.name, text: (item) => item.name },
      { pattern: filter.locator, text: (item) => item.locator },
    ],
    undefined,
    signal,
  );
  return result.map((item) => item.id);
}
