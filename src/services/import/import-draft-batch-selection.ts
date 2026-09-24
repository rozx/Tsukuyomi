import type { ImportDraft } from 'src/models/import';
import type { ImportDraftBatch, ImportDraftBatchInput } from 'src/models/import-draft-batch';
import type { ImportParsingClient } from './import-parsing-client';
import { filterImportItems } from './import-pattern-filter';
import { cleanDraftChapters } from './import-draft-batch-content';

function checkIds(ids: string[] | undefined, available: { id: string }[]) {
  if (
    ids !== undefined &&
    (!ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !available.some((item) => item.id === id)))
  )
    throw new Error('INVALID_SCOPE: 范围包含不存在或重复的 ID');
}

export async function prepareDraftBatchChanges(
  taskId: string,
  draft: ImportDraft,
  input: ImportDraftBatchInput,
  parser: ImportParsingClient,
  signal?: AbortSignal,
) {
  const { scope } = input;
  checkIds(scope.chapter_ids, draft.chapters);
  checkIds(scope.volume_ids, draft.volumes);
  if (input.target === 'volume_title' && (scope.chapter_ids || scope.selected_only !== undefined))
    throw new Error('INVALID_SCOPE: 卷标题仅接受卷 ID 或标题筛选');
  const items: { id: string; title: string }[] =
    input.target === 'volume_title'
      ? draft.volumes.filter((v) => !scope.volume_ids || scope.volume_ids.includes(v.id))
      : draft.chapters.filter(
          (c) =>
            (!scope.chapter_ids || scope.chapter_ids.includes(c.id)) &&
            (!scope.volume_ids || scope.volume_ids.includes(c.volumeId)) &&
            (!scope.selected_only || c.selected),
        );
  const selected = await filterImportItems(
    items,
    [{ pattern: scope.title, text: (item) => item.title }],
    parser,
    signal,
  );
  if (selected.length > 500) throw new Error('BATCH_LIMIT: 每批最多 500 项，请缩小范围');
  if (input.target === 'body') {
    if (
      !['remove_matches', 'remove_lines'].includes(input.action) ||
      input.replacement !== undefined
    )
      throw new Error('INVALID_OPERATION: 正文仅支持删除匹配片段或整行');
    const ids = new Set(selected.map((item) => item.id));
    const result = await cleanDraftChapters(
      taskId,
      draft.chapters.filter((c) => ids.has(c.id)),
      input,
      parser,
      signal,
    );
    return { ...result, volumes: [] };
  }
  if (!['chapter_title', 'volume_title'].includes(input.target) || input.action !== 'replace')
    throw new Error('INVALID_OPERATION: 标题修改须使用 replace');
  const { value } = await parser.run(
    {
      kind: 'pattern',
      texts: selected.map((item) => item.title),
      pattern: input.pattern,
      action: 'replace',
      replacement: input.replacement ?? '',
    },
    { ...(signal ? { signal } : {}) },
  );
  const updates = new Map<string, string>();
  const examples: ImportDraftBatch['summary']['examples'] = [];
  let matches = 0;
  selected.forEach((item, index) => {
    const result = value[index]!;
    matches += result.matches;
    if (!result.text.trim() || result.text.length > 500)
      throw new Error('METADATA_LIMIT: 标题不能为空或超过 500 字符');
    if (item.title === result.text) return;
    updates.set(item.id, result.text);
    if (examples.length < 5)
      examples.push({
        id: item.id,
        before: item.title.slice(0, 240),
        after: result.text.slice(0, 240),
      });
  });
  return {
    chapters:
      input.target === 'chapter_title'
        ? draft.chapters
            .filter((c) => updates.has(c.id))
            .map((c) => ({ ...c, title: updates.get(c.id)!, inferredTitle: true }))
        : [],
    volumes:
      input.target === 'volume_title'
        ? draft.volumes
            .filter((v) => updates.has(v.id))
            .map((v) => ({ ...v, title: updates.get(v.id)!, inferred: true }))
        : [],
    matches,
    examples,
  };
}
