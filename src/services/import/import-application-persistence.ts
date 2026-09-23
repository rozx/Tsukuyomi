import type { IDBPTransaction } from 'idb';
import type { ImportOperation, ImportPlan, ImportTask } from 'src/models/import';
import type { Novel } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import { serializeDates } from 'src/utils/serialize-dates';
import { canonicalStringify } from 'src/utils/canonical-json';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { bumpBookRevision } from 'src/services/book-revision';
import { serializeBookRecord } from 'src/services/library-persistence';
import { mergeBookDeletionRecords } from 'src/services/sync-config-persistence';
import { ImportLibraryReader } from './import-library-reader';
import { fingerprintImportBook, loadImportPlanContext } from './import-plan-context';

const STORES = [
  'books',
  'chapter-contents',
  'book-revisions',
  'import-tasks',
  'import-operations',
  'sync-configs',
] as const;
type Transaction = IDBPTransaction<TsukuyomiDB, typeof STORES, 'readwrite'>;

async function mutateOperation(
  id: string,
  terminal: ImportOperation['state'],
  update: (tx: Transaction, current: ImportOperation) => Promise<ImportOperation>,
): Promise<ImportOperation> {
  const tx = (await getDB()).transaction(STORES, 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const current = await tx.objectStore('import-operations').get(id);
    if (!current) throw new Error('PLAN_STALE: 操作已不存在');
    if (current.state === terminal) return current;
    return update(tx, current);
  });
}

export function affectedImportChapters(plan: ImportPlan): string[] {
  return [
    ...new Set([...plan.chapters.map((chapter) => chapter.chapterId), ...plan.removedChapterIds]),
  ];
}

export async function readImportOperation(
  taskId: string,
  operationId: string,
): Promise<ImportOperation> {
  const operation = await (await getDB()).get('import-operations', operationId);
  if (!operation || operation.taskId !== taskId)
    throw new Error('PLAN_STALE: 导入方案不存在或不属于当前任务');
  return operation;
}

function assertTask(task: ImportTask | undefined, plan: ImportPlan): asserts task is ImportTask {
  if (!task || task.currentPlanId !== plan.id || task.draft.revision !== plan.draftRevision)
    throw new Error('PLAN_STALE: 草稿或预览已变化，请重新检查');
  if (['running', 'pausing', 'applying', 'reverting'].includes(task.state))
    throw new Error('TASK_BUSY: 导入任务仍在执行');
  if (task.pendingQuestion?.required || task.draft.novelScope.needsChoice || plan.conflicts.length)
    throw new Error('PLAN_CONFLICT: 请先处理必要选择及匹配冲突');
}

async function captureBefore(
  tx: Transaction,
  plan: ImportPlan,
  book: Novel | undefined,
): Promise<NonNullable<ImportOperation['before']>> {
  const chapters: NonNullable<ImportOperation['before']>['chapters'] = [];
  const affected = new Set(affectedImportChapters(plan));
  const owners = await tx.objectStore('books').getAll();
  if (
    owners.some(
      (owner) =>
        owner.id !== plan.targetBookId &&
        owner.volumes?.some((volume) =>
          volume.chapters?.some((chapter) => affected.has(chapter.id)),
        ),
    )
  )
    throw new Error('PLAN_STALE: 受影响的章节标识已被其他小说引用');
  const old = (book?.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
  for (const id of affectedImportChapters(plan)) {
    const record = await tx.objectStore('chapter-contents').get(id);
    const chapter = old.find((entry) => entry.id === id);
    const loaded = ImportLibraryReader.decodeChapter(
      record ??
        (chapter?.content !== undefined
          ? {
              chapterId: id,
              content: JSON.stringify(chapter.content),
              lastModified: String(chapter.lastEdited),
            }
          : undefined),
    );
    if (loaded.kind === 'failed') throw new Error(`BOOK_READ_FAILED: ${loaded.message}`);
    if (record && !chapter) throw new Error('PLAN_STALE: 新章节标识已被占用');
    chapters.push({ chapterId: id, record: record ?? null });
  }
  if (!book) return { book: null, chapters };
  const { defaultAIModel: _privateModels, ...safeBook } = book;
  return { book: safeBook, chapters };
}

function rebaseAppliedDraft(
  task: ImportTask,
  plan: ImportPlan,
  revision: number,
  before: NonNullable<ImportOperation['before']>,
): void {
  const mappings = (task.appliedMappings ??= []);
  const prior = mappings.find((mapping) => mapping.bookId === plan.targetBookId);
  const chapters = new Map(prior?.chapters.map((chapter) => [chapter.draftChapterId, chapter]));
  for (const mapping of plan.mappings) chapters.set(mapping.draftChapterId, mapping);
  if (prior) prior.chapters = [...chapters.values()];
  else mappings.push({ bookId: plan.targetBookId, chapters: [...chapters.values()] });
  task.draft.target = { kind: 'existing', bookId: plan.targetBookId, basis: 'user' };
  for (const chapter of task.draft.chapters) {
    const mapped = chapters.get(chapter.id);
    if (mapped) chapter.match = { chapterIds: [mapped.chapterId], basis: 'receipt' };
    // 被清理的既有正文已成为书库的新原文，后续预览不能再次扣除同一范围。
    const applied = plan.mappings.find((entry) => entry.draftChapterId === chapter.id);
    const content =
      applied && plan.chapters.find((entry) => entry.chapterId === applied.chapterId)?.content;
    if (
      content &&
      chapter.content.some((ref) => ref.kind === 'existing' && ref.excludeRanges?.length)
    ) {
      const previous = structuredClone(chapter.content);
      chapter.content = content.map((paragraph) => ({
        kind: 'existing',
        bookId: plan.targetBookId,
        bookRevision: revision,
        chapterId: applied!.chapterId,
        paragraphId: paragraph.id,
      }));
      (before.filteredDrafts ??= []).push({
        chapterId: chapter.id,
        before: previous,
        after: structuredClone(chapter.content),
      });
      continue;
    }
    for (const ref of chapter.content) {
      if (ref.kind !== 'existing' || ref.bookId !== plan.targetBookId) continue;
      const change = plan.paragraphChanges.find(
        (entry) =>
          entry.fromChapterId === ref.chapterId && entry.fromParagraphId === ref.paragraphId,
      );
      if (change) {
        ref.chapterId = change.chapterId;
        ref.paragraphId = change.paragraphId;
      }
      ref.bookRevision = revision;
    }
  }
  task.draft.revision++;
}

async function validatePreparedPlan(operation: ImportOperation) {
  const { plan } = operation;
  const context = await loadImportPlanContext(plan.taskId, plan.draftRevision).catch(
    (error: unknown) => {
      if (error instanceof Error && error.message.startsWith('DRAFT_CHANGED'))
        throw new Error('PLAN_STALE: 草稿已变化');
      throw error;
    },
  );
  assertTask(context.task, plan);
  for (const id of affectedImportChapters(plan))
    if (context.snapshot?.chapters[id]?.kind === 'failed')
      throw new Error('BOOK_READ_FAILED: 受影响正文读取失败');
  if (
    (context.snapshot?.revision ?? 0) !== plan.baseBookRevision ||
    (await fingerprintImportBook(context.snapshot)) !== plan.baseDigest
  )
    throw new Error('PLAN_STALE: 目标小说已变化，请重新预览');
  for (const chapter of context.chapters) {
    const { match: _match, ...plain } = chapter;
    await context.validator.chapter(context.task.draft, plain, 'user');
  }
  for (const id of plan.resourceIds) await context.resource(id);
  return context;
}

export async function applyImportOperation(operation: ImportOperation): Promise<ImportOperation> {
  const { plan } = operation;
  const context = await validatePreparedPlan(operation);
  const now = Date.now();
  const models = context.snapshot?.book.defaultAIModel;
  const next = serializeBookRecord({
    ...plan.book,
    ...(models ? { defaultAIModel: models } : {}),
    lastEdited: new Date(now),
  });
  const records = plan.chapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    bookId: plan.targetBookId,
    content: JSON.stringify(chapter.content),
    lastModified: new Date(now).toISOString(),
  }));
  return mutateOperation(operation.id, 'applied', async (tx, current) => {
    if (current?.state !== 'planned') throw new Error('PLAN_STALE: 方案已失效');
    const task = await tx.objectStore('import-tasks').get(plan.taskId);
    assertTask(task, plan);
    const book = await tx.objectStore('books').get(plan.targetBookId);
    const revision = (await tx.objectStore('book-revisions').get(plan.targetBookId))?.revision ?? 0;
    if (
      revision !== plan.baseBookRevision ||
      (book !== undefined) !== (plan.targetKind === 'existing') ||
      canonicalStringify(book) !== canonicalStringify(context.snapshot?.book)
    )
      throw new Error('PLAN_STALE: 目标小说已变化');
    const before = await captureBefore(tx, plan, book);
    before.target = task.draft.target;
    if (task.appliedMappings) before.mappings = structuredClone(task.appliedMappings);
    const updated: ImportOperation = {
      ...current,
      before,
      state: 'applied',
      appliedAt: now,
      pendingMaintenance: ['library'],
    };
    // 快照和书库属于同一个事务；先保存快照也不能留下单独的已应用回执。
    await tx.objectStore('import-operations').put(updated);
    for (const record of records) await tx.objectStore('chapter-contents').put(record);
    for (const id of plan.removedChapterIds) await tx.objectStore('chapter-contents').delete(id);
    await tx.objectStore('books').put(next);
    updated.postApplyBookRevision = await bumpBookRevision(
      tx.objectStore('book-revisions'),
      plan.targetBookId,
      plan.operationId,
    );
    rebaseAppliedDraft(task, plan, updated.postApplyBookRevision, before);
    task.state = 'applied';
    task.updatedAt = now;
    await tx.objectStore('import-tasks').put(task);
    await tx.objectStore('import-operations').put(updated);
    return updated;
  });
}

function restoreTaskTarget(task: ImportTask, operation: ImportOperation): void {
  const { plan, before } = operation;
  if (task.draft.target.kind !== 'existing' || task.draft.target.bookId !== plan.targetBookId)
    return;
  task.draft.target = before?.target ?? { kind: 'new' };
  task.appliedMappings = before?.mappings ?? [];
  for (const chapter of task.draft.chapters) {
    if (chapter.match?.basis === 'receipt') delete chapter.match;
    const saved = before?.filteredDrafts?.find((entry) => entry.chapterId === chapter.id);
    if (saved && canonicalStringify(chapter.content) === canonicalStringify(saved.after)) {
      chapter.content = structuredClone(saved.before);
      for (const ref of chapter.content)
        if (ref.kind === 'existing' && ref.bookId === plan.targetBookId)
          ref.bookRevision = operation.postRevertBookRevision!;
      continue;
    }
    for (const ref of chapter.content) {
      if (ref.kind !== 'existing' || ref.bookId !== plan.targetBookId) continue;
      const change = plan.paragraphChanges.find(
        (entry) =>
          entry.chapterId === ref.chapterId &&
          entry.paragraphId === ref.paragraphId &&
          entry.fromChapterId &&
          entry.fromParagraphId,
      );
      if (change) {
        ref.chapterId = change.fromChapterId!;
        ref.paragraphId = change.fromParagraphId!;
      }
      ref.bookRevision = operation.postRevertBookRevision!;
    }
  }
}

export async function revertImportOperation(operation: ImportOperation): Promise<ImportOperation> {
  return mutateOperation(operation.id, 'reverted', async (tx, current) => {
    if (current?.state !== 'applied' || !current.before)
      throw new Error('UNDO_UNAVAILABLE: 此操作尚未应用或快照不可用');
    const { plan, before } = current;
    const task = await tx.objectStore('import-tasks').get(current.taskId);
    if (!task || ['running', 'pausing'].includes(task.state))
      throw new Error('TASK_BUSY: 请等待导入任务停止');
    const revision = (await tx.objectStore('book-revisions').get(plan.targetBookId))?.revision ?? 0;
    const currentBook = await tx.objectStore('books').get(plan.targetBookId);
    if (revision !== current.postApplyBookRevision || !currentBook)
      throw new Error('BOOK_CHANGED: 目标小说已有后续修改，不能整次撤销');
    const now = Date.now();
    for (const chapter of before.chapters) {
      if (chapter.record)
        await tx
          .objectStore('chapter-contents')
          .put({ ...chapter.record, chapterId: chapter.chapterId });
      else await tx.objectStore('chapter-contents').delete(chapter.chapterId);
    }
    if (before.book)
      await tx.objectStore('books').put(
        serializeDates({
          ...before.book,
          ...(currentBook.defaultAIModel ? { defaultAIModel: currentBook.defaultAIModel } : {}),
          lastEdited: new Date(now),
        }),
      );
    else {
      await tx.objectStore('books').delete(plan.targetBookId);
      await mergeBookDeletionRecords(tx.objectStore('sync-configs'), [plan.targetBookId], now);
    }
    current.postRevertBookRevision = await bumpBookRevision(
      tx.objectStore('book-revisions'),
      plan.targetBookId,
      current.id,
    );
    current.state = 'reverted';
    current.revertedAt = now;
    current.pendingMaintenance = ['library'];
    restoreTaskTarget(task, current);
    task.draft.revision++;
    task.state = 'reverted';
    task.updatedAt = now;
    await tx.objectStore('import-tasks').put(task);
    await tx.objectStore('import-operations').put(current);
    return current;
  });
}
