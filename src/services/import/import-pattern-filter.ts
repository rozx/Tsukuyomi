import type { ImportTextPattern } from 'src/models/import-pattern';
import { ImportParsingClient } from './import-parsing-client';

export async function filterImportItems<T>(
  items: T[],
  filters: { pattern: ImportTextPattern | undefined; text: (item: T) => string }[],
  parser = new ImportParsingClient(),
  signal?: AbortSignal,
): Promise<T[]> {
  let selected = items;
  for (const filter of filters) {
    if (!filter.pattern) continue;
    const { value } = await parser.run(
      {
        kind: 'pattern',
        texts: selected.map(filter.text),
        pattern: filter.pattern,
        action: 'test',
      },
      { ...(signal ? { signal } : {}) },
    );
    selected = selected.filter((_, index) => value[index]!.matches > 0);
  }
  return selected;
}
