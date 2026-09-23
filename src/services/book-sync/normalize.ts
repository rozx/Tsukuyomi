import type { BookUpdateRecipe } from 'src/models/book-sync';
import { ImportParsingClient } from 'src/services/import/import-parsing-client';
import { cleanupError } from './errors';

/** 标题由目录提供，只剥离正文首个非空行中的精确标题，避免误删正文。 */
export async function normalizeChapterText(
  raw: string,
  recipe: BookUpdateRecipe,
  options: {
    title?: string;
    parser?: ImportParsingClient;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<string[]> {
  options.signal?.throwIfAborted();
  let text = raw;
  const parser = options.parser ?? new ImportParsingClient();
  for (const rule of recipe.cleanup ?? []) {
    try {
      const result = await parser.run(
        { kind: 'pattern', texts: [text], ...rule },
        {
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.timeoutMs ? { limits: { timeoutMs: options.timeoutMs } } : {}),
        },
      );
      text = result.value[0]!.text;
    } catch (error) {
      cleanupError(error);
    }
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (recipe.stripHeading && options.title?.trim()) {
    const first = lines.findIndex((line) => line.trim());
    if (first >= 0 && lines[first]!.trim() === options.title.trim()) lines.splice(first, 1);
  }
  return lines;
}
