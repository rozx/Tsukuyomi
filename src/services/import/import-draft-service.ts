import type {
  ImportDraft,
  ImportDraftEdit,
  ImportDraftOperation,
  ImportTask,
} from 'src/models/import';
import { ImportRepository } from './import-repository';
import type { ImportTaskMutationOptions, ImportTransaction } from './import-repository';
import { ImportLibraryReader } from './import-library-reader';
import {
  ImportDraftValidator,
  assertImportKeys,
  assertImportString,
} from './import-draft-validation';
import type { ImportBookSnapshots } from './import-draft-validation';
import { declareImportCandidates } from './import-novel-scope';

interface EditOptions extends ImportTaskMutationOptions<ImportDraft> {
  actor?: 'user' | 'agent';
}

function transactionValidator(taskId: string, tx: ImportTransaction, books: ImportBookSnapshots) {
  return new ImportDraftValidator(
    taskId,
    {
      resource: (id) => tx.objectStore('import-resources').get(id),
      source: (id) => tx.objectStore('import-sources').get(id),
    },
    books,
  );
}
const OPERATION_FIELDS: Record<ImportDraftOperation['op'], string[]> = {
  set_metadata: ['op', 'field', 'value', 'sourceId', 'resourceId'],
  propose_target: ['op', 'bookId'],
  declare_candidates: ['op', 'candidates'],
  upsert_volume: ['op', 'id', 'title', 'inferred'],
  upsert_chapter: ['op', 'chapter'],
  remove_chapter: ['op', 'chapterId'],
  remove_volume: ['op', 'volumeId'],
  clear_structure: ['op'],
  reorder_chapters: ['op', 'chapterIds'],
  reorder_volumes: ['op', 'volumeIds'],
  propose_match: ['op', 'chapterId', 'targetChapterIds'],
  set_completeness: ['op', 'completeness'],
};

function assertEdit(input: ImportDraftEdit): void {
  assertImportKeys(input, ['baseDraftRevision', 'operations']);
  if (
    !Number.isSafeInteger(input.baseDraftRevision) ||
    input.baseDraftRevision < 0 ||
    !Array.isArray(input.operations) ||
    !input.operations.length ||
    input.operations.length > 128
  )
    throw new Error('INVALID_OPERATION: 草稿版本或操作数量无效');
  for (const operation of input.operations) {
    if (!operation || !Object.hasOwn(OPERATION_FIELDS, operation.op))
      throw new Error('INVALID_OPERATION: 未知草稿操作');
    assertImportKeys(operation, OPERATION_FIELDS[operation.op]);
  }
}

function reorder<T extends { id: string }>(values: T[], ids: string[]): T[] {
  if (
    !Array.isArray(ids) ||
    ids.length !== values.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !values.some((value) => value.id === id))
  )
    throw new Error('INVALID_OPERATION: 排序必须包含全部条目且不能重复');
  const byId = new Map(values.map((value) => [value.id, value]));
  return ids.map((id) => byId.get(id)!);
}

export function invalidateImportPreview(task: ImportTask): void {
  if (['ready', 'applied', 'reverted', 'failed'].includes(task.state)) task.state = 'draft';
}

async function loadBooks(task: ImportTask, input: ImportDraftEdit): Promise<ImportBookSnapshots> {
  const ids = new Set<string>();
  for (const operation of input.operations) {
    if (operation.op === 'propose_target' && typeof operation.bookId === 'string')
      ids.add(operation.bookId);
    if (operation.op === 'upsert_chapter' && Array.isArray(operation.chapter?.content)) {
      for (const ref of operation.chapter.content) if (ref.kind === 'existing') ids.add(ref.bookId);
    }
    if (operation.op === 'propose_match' && task.draft.target.kind === 'existing')
      ids.add(task.draft.target.bookId);
  }
  const books: ImportBookSnapshots = new Map();
  for (const id of ids) books.set(id, await ImportLibraryReader.readBook(id));
  return books;
}

async function metadataOperation(
  task: ImportTask,
  operation: Extract<ImportDraftOperation, { op: 'set_metadata' }>,
  actor: 'user' | 'agent',
  validator: ImportDraftValidator,
): Promise<void> {
  if (!['title', 'author', 'description', 'cover', 'alternateTitles'].includes(operation.field))
    throw new Error('INVALID_OPERATION: 未知元信息字段');
  assertImportString(operation.value, '元信息', operation.field !== 'title');
  const candidate = await validator.metadata(
    task.draft,
    operation.field,
    operation.value,
    actor,
    operation.sourceId,
    operation.resourceId,
  );
  if (actor === 'agent') {
    task.draft.metadataCandidates ??= [];
    const same = task.draft.metadataCandidates.find(
      (item) =>
        item.field === operation.field &&
        item.value.value === candidate.value.value &&
        item.value.resourceId === candidate.value.resourceId &&
        item.scopeRevision === task.draft.novelScope.revision,
    );
    if (!same)
      task.draft.metadataCandidates.push({
        id: crypto.randomUUID(),
        field: operation.field,
        value: candidate.value,
        conflicts: candidate.conflicts,
        scopeRevision: task.draft.novelScope.revision,
      });
  } else task.draft.metadata[operation.field] = candidate.value;
}

function targetOperation(
  draft: ImportDraft,
  bookId: string | null,
  actor: 'user' | 'agent',
  books: ImportBookSnapshots,
): void {
  if (bookId !== null) {
    assertImportString(bookId, '目标小说');
    if (books.get(bookId)?.kind !== 'loaded')
      throw new Error('BOOK_READ_FAILED: 目标小说不存在或无法读取');
  }
  if (
    actor === 'agent' &&
    draft.target.kind === 'existing' &&
    draft.target.basis === 'user' &&
    draft.target.bookId !== bookId
  ) {
    draft.targetSuggestion = { bookId };
    return;
  }
  const prior = draft.target.kind === 'existing' ? draft.target.bookId : null;
  draft.target =
    bookId === null
      ? { kind: 'new' }
      : { kind: 'existing', bookId, basis: actor === 'user' ? 'user' : 'suggestion' };
  delete draft.targetSuggestion;
  if (prior !== bookId) {
    for (const chapter of draft.chapters) {
      delete chapter.match;
      if (chapter.content.some((ref) => ref.kind === 'existing' && ref.bookId !== bookId)) {
        chapter.selected = false;
        chapter.status = 'pending';
      }
    }
  }
}

function matchOperation(
  draft: ImportDraft,
  operation: Extract<ImportDraftOperation, { op: 'propose_match' }>,
  actor: 'user' | 'agent',
  books: ImportBookSnapshots,
): void {
  const chapter = draft.chapters.find((item) => item.id === operation.chapterId);
  const book = draft.target.kind === 'existing' ? books.get(draft.target.bookId) : undefined;
  if (
    !chapter ||
    book?.kind !== 'loaded' ||
    !Array.isArray(operation.targetChapterIds) ||
    new Set(operation.targetChapterIds).size !== operation.targetChapterIds.length ||
    operation.targetChapterIds.some((id) => !(id in book.chapters))
  )
    throw new Error('INVALID_OPERATION: 章节匹配目标无效');
  if (actor === 'agent' && chapter.match?.basis === 'user')
    throw new Error('USER_MATCH_PROTECTED: 请保留用户已选择的对应关系');
  chapter.match = {
    chapterIds: operation.targetChapterIds,
    basis: actor === 'user' ? 'user' : 'suggestion',
  };
}

async function applyOperation(
  task: ImportTask,
  operation: ImportDraftOperation,
  actor: 'user' | 'agent',
  validator: ImportDraftValidator,
  books: ImportBookSnapshots,
): Promise<void> {
  const draft = task.draft;
  switch (operation.op) {
    case 'set_metadata':
      await metadataOperation(task, operation, actor, validator);
      return;
    case 'propose_target':
      targetOperation(draft, operation.bookId, actor, books);
      return;
    case 'declare_candidates':
      await validator.candidates(operation.candidates);
      declareImportCandidates(task, operation.candidates);
      return;
    case 'upsert_volume': {
      if (draft.novelScope.needsChoice) throw new Error('NOVEL_CHOICE_REQUIRED: 请先选择小说');
      assertImportString(operation.title, '卷标题');
      if (operation.title.length > 500) throw new Error('METADATA_LIMIT: 卷标题超过 500 字符');
      const id = operation.id ?? crypto.randomUUID();
      assertImportString(id, '卷 ID');
      const index = draft.volumes.findIndex((volume) => volume.id === id);
      const volume = {
        id,
        title: operation.title,
        inferred: actor === 'agent' || Boolean(operation.inferred),
      };
      if (index < 0) draft.volumes.push(volume);
      else draft.volumes[index] = volume;
      return;
    }
    case 'upsert_chapter': {
      const chapter = await validator.chapter(draft, operation.chapter, actor);
      const index = draft.chapters.findIndex((item) => item.id === chapter.id);
      if (index < 0) draft.chapters.push(chapter);
      else
        draft.chapters[index] = {
          ...chapter,
          ...(draft.chapters[index]?.match ? { match: draft.chapters[index]!.match } : {}),
        };
      return;
    }
    case 'remove_chapter': {
      if (!draft.chapters.some((chapter) => chapter.id === operation.chapterId))
        throw new Error('INVALID_OPERATION: 章节不存在');
      draft.chapters = draft.chapters.filter((chapter) => chapter.id !== operation.chapterId);
      return;
    }
    case 'remove_volume': {
      if (!draft.volumes.some((volume) => volume.id === operation.volumeId))
        throw new Error('INVALID_OPERATION: 卷不存在');
      draft.chapters = draft.chapters.filter((chapter) => chapter.volumeId !== operation.volumeId);
      draft.volumes = draft.volumes.filter((volume) => volume.id !== operation.volumeId);
      return;
    }
    case 'clear_structure':
      draft.chapters = [];
      draft.volumes = [];
      return;
    case 'reorder_chapters':
      draft.chapters = reorder(draft.chapters, operation.chapterIds);
      return;
    case 'reorder_volumes':
      draft.volumes = reorder(draft.volumes, operation.volumeIds);
      return;
    case 'propose_match':
      matchOperation(draft, operation, actor, books);
      return;
    case 'set_completeness': {
      const value = operation.completeness;
      assertImportKeys(value, ['knownTotal', 'confirmed', 'missing']);
      if (
        typeof value.confirmed !== 'boolean' ||
        !Array.isArray(value.missing) ||
        value.missing.some((item) => typeof item !== 'string') ||
        (value.knownTotal !== undefined &&
          (!Number.isSafeInteger(value.knownTotal) || value.knownTotal < 0))
      )
        throw new Error('INVALID_OPERATION: 完整性信息无效');
      draft.completeness = value;
      return;
    }
  }
}

export class ImportDraftService {
  static async edit(
    taskId: string,
    input: ImportDraftEdit,
    options: EditOptions = {},
  ): Promise<ImportDraft> {
    assertEdit(input);
    const before = await ImportRepository.getTask(taskId);
    if (!before) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    const clean = JSON.parse(JSON.stringify(input)) as ImportDraftEdit;
    const books = await loadBooks(before, clean);
    return ImportRepository.mutateTask(
      taskId,
      async (task, tx) => {
        if (task.draft.revision !== clean.baseDraftRevision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新读取');
        if (['applying', 'reverting'].includes(task.state))
          throw new Error('TASK_BUSY: 正在提交导入变更');
        if (
          options.actor === 'user' &&
          clean.operations.some((operation) =>
            ['remove_chapter', 'remove_volume', 'clear_structure'].includes(operation.op),
          ) &&
          (task.run || ['running', 'pausing'].includes(task.state))
        )
          throw new Error('TASK_BUSY: 请先暂停月詠并等待当前操作结束，再删除草稿');
        const validator = transactionValidator(taskId, tx, books);
        invalidateImportPreview(task);
        for (const operation of clean.operations)
          await applyOperation(task, operation, options.actor ?? 'agent', validator, books);
        task.draft.revision++;
        return task.draft;
      },
      options,
    );
  }

  /** 仅供实际 UI 回答调用；不注册为 Agent 工具。null 表示取消，保留必要问题。 */
  static async chooseNovel(
    taskId: string,
    questionId: string,
    scopeRevision: number,
    candidateId: string | null,
  ): Promise<ImportDraft> {
    const before = await ImportRepository.getTask(taskId);
    const books: ImportBookSnapshots = new Map();
    for (const chapter of before?.draft.chapters ?? []) {
      for (const ref of chapter.content) {
        if (ref.kind === 'existing' && !books.has(ref.bookId))
          books.set(ref.bookId, await ImportLibraryReader.readBook(ref.bookId));
      }
    }
    return ImportRepository.mutateTask(taskId, async (task, tx) => {
      const scope = task.draft.novelScope;
      const question = task.pendingQuestion;
      if (
        !question ||
        question.kind !== 'novel' ||
        question.id !== questionId ||
        question.scopeRevision !== scopeRevision ||
        scope.revision !== scopeRevision
      )
        throw new Error('QUESTION_CHANGED: 选择问题或来源范围已变化');
      if (candidateId === null) return task.draft;
      const candidate = scope.candidates.find((item) => item.id === candidateId);
      if (!candidate) throw new Error('INVALID_SELECTION: 小说候选不存在');
      const prior = scope.previousSelection;
      scope.selectedCandidateId = candidateId;
      scope.needsChoice = false;
      scope.confirmation = { questionId, scopeRevision, answeredAt: Date.now() };
      if (
        !prior ||
        prior.id !== candidateId ||
        prior.title !== candidate.title ||
        prior.author !== candidate.author
      ) {
        task.draft.target = { kind: 'new' };
        delete task.draft.targetSuggestion;
        task.draft.metadataCandidates = [];
        task.draft.metadata = {
          title: { value: candidate.title, origin: 'user', adopted: true },
          ...(candidate.author
            ? { author: { value: candidate.author, origin: 'user', adopted: true } }
            : {}),
        };
        for (const chapter of task.draft.chapters) delete chapter.match;
      }
      const validator = transactionValidator(taskId, tx, books);
      for (const chapter of task.draft.chapters) {
        // 用户选择新作品后，旧草稿仍保留，但范围外内容不能继续参与导入。
        try {
          const { match: _match, ...plain } = chapter;
          await validator.chapter(task.draft, plain, 'user');
        } catch {
          chapter.selected = false;
        }
      }
      delete scope.previousSelection;
      task.draft.revision++;
      delete task.pendingQuestion;
      task.state = 'paused';
      return task.draft;
    });
  }
}
