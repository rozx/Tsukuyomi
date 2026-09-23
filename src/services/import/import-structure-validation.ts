import { mergeImportRanges } from './import-content-exclusions';
import type { ImportContentRef, ImportDraft, ImportResource, ImportTask } from 'src/models/import';
import type { ImportTextStructureBatch } from 'src/models/import-text-structure';
import type { ImportTransaction } from './import-repository';
import { importTransactionValidator } from './import-draft-validation';
import { resolveImportSegments } from './import-content-references';
import { structureContent } from './import-structure-content';

type Extraction = Extract<ImportResource, { kind: 'extraction' }>;
function originalRanges(resource: Extraction, refs: ImportContentRef[]) {
  return mergeImportRanges(
    refs.flatMap((ref) =>
      ref.kind === 'extraction' && ref.resourceId === resource.id
        ? resolveImportSegments(resource, ref).map((s) => ({
            start: s.block.start + s.ref.start!,
            end: s.block.start + s.ref.end!,
          }))
        : [],
    ),
  );
}

async function validateOverlap(
  draft: ImportDraft,
  resource: Extraction,
  batch: ImportTextStructureBatch,
  tx: ImportTransaction,
) {
  const replacements = new Set(batch.input.replace_chapter_ids ?? []);
  if (replacements.size !== (batch.input.replace_chapter_ids?.length ?? 0))
    throw new Error('INVALID_STRUCTURE: 替换章节不能重复');
  for (const id of replacements)
    if (!draft.chapters.some((c) => c.id === id))
      throw new Error('CHAPTER_NOT_FOUND: 待替换章节不存在');
  const ranges = originalRanges(
    resource,
    structureContent(resource).slice(batch.summary.selected).refs,
  );
  const cache = new Map<string, ImportResource | undefined>([[resource.id, resource]]);
  const lookup = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await tx.objectStore('import-resources').get(id));
    return cache.get(id);
  };
  for (const chapter of draft.chapters) {
    const replacing = replacements.has(chapter.id);
    if (replacing && !chapter.content.length && !chapter.sourceIds.includes(resource.sourceId))
      throw new Error('REPLACEMENT_SCOPE: 待替换空章节不属于该来源');
    for (const ref of chapter.content) {
      const previous = await previousExtraction(ref, resource.sourceId, replacing, lookup);
      if (!previous || replacing) continue;
      if (
        previous.snapshotId !== resource.snapshotId ||
        originalRanges(previous, [ref]).some((old) =>
          ranges.some((r) => old.start < r.end && old.end > r.start),
        )
      )
        throw new Error(
          `CONTENT_OVERLAP: 来源内容已用于「${chapter.title}」，请明确 replace_chapter_ids 或缩小范围`,
        );
    }
  }
}

async function previousExtraction(
  ref: ImportContentRef,
  sourceId: string,
  replacing: boolean,
  lookup: (id: string) => Promise<ImportResource | undefined>,
): Promise<Extraction | undefined> {
  if (ref.kind !== 'extraction') {
    if (replacing) throw new Error('REPLACEMENT_SCOPE: 不能用单文件拆章替换包含既有书库内容的章节');
    return;
  }
  const resource = await lookup(ref.resourceId);
  if (resource?.kind === 'extraction' && resource.sourceId === sourceId) return resource;
  if (replacing) throw new Error('REPLACEMENT_SCOPE: 待替换章节包含其他来源');
}

export async function validateStructurePlan(
  task: ImportTask,
  tx: ImportTransaction,
  batch: ImportTextStructureBatch,
) {
  const { input, summary } = batch;
  if (task.draft.revision !== input.base_draft_revision)
    throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
  const resource = await tx.objectStore('import-resources').get(input.resource_id);
  if (
    resource?.taskId !== task.id ||
    resource.kind !== 'extraction' ||
    resource.snapshotId !== summary.snapshotId
  )
    throw new Error('SOURCE_CHANGED: 提取资源已变化');
  const source = await tx.objectStore('import-sources').get(resource.sourceId);
  if (!source || source.taskId !== task.id || source.currentSnapshotId !== resource.snapshotId)
    throw new Error('SOURCE_CHANGED: 来源快照已变化，请重新提取和预览');
  const draft = { ...task.draft, volumes: [...task.draft.volumes] };
  for (const volume of batch.volumes)
    if (!draft.volumes.some((v) => v.id === volume.id)) draft.volumes.push(volume);
  const validator = importTransactionValidator(task.id, tx);
  // 覆盖完整选择范围，标题分离和未选中的待归类内容都不能绕过作品授权。
  await validator.chapter(
    draft,
    {
      id: 'structure-scope',
      volumeId: batch.volumes[0]!.id,
      title: '范围验证',
      inferredTitle: true,
      inferredStructure: true,
      selected: false,
      status: 'ready',
      sourceIds: [source.id],
      content: structureContent(resource).slice(summary.selected).refs,
    },
    'agent',
  );
  await validateOverlap(task.draft, resource, batch, tx);
  const chapters = [];
  for (const chapter of batch.chapters)
    chapters.push({
      ...(await validator.chapter(draft, chapter, 'agent')),
      inferredTitle: chapter.inferredTitle,
    });
  return chapters;
}
