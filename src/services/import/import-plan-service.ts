import type { Chapter } from 'src/models/novel';
import type { ImportPlan, ImportOperation, ImportSource } from 'src/models/import';
import type { ImportNewParagraph, ImportOldParagraph } from 'src/models/import-matching';
import { getDB } from 'src/utils/indexed-db';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { canonicalStringify } from 'src/utils/canonical-json';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { ImportRepository, checkImportRun, finishImportTask } from './import-repository';
import type { ImportTaskMutationOptions } from './import-repository';
import { ImportParsingClient } from './import-parsing-client';
import { loadImportPlanContext, fingerprintImportBook } from './import-plan-context';
import type { ImportPlanContext } from './import-plan-context';
import {
  matchImportChapters,
  groupImportChapters,
  importChapterOrigins,
} from './import-plan-chapters';
import type { ImportChapterMatch } from './import-plan-chapters';
import { assembleImportParagraphs } from './import-plan-content';
import { buildImportBook } from './import-plan-layout';
import type { ResolvedImportChapter } from './import-plan-layout';
import { NovelScraperFactory } from 'src/services/scraper/novel-scraper-factory';
import { applyImportRecipe, evaluateImportRecipe } from './import-plan-recipe';

function comparableBook(book: ImportPlan['book']): string {
  const copy = JSON.parse(JSON.stringify(book)) as ImportPlan['book'];
  delete copy.defaultAIModel;
  delete (copy as Partial<typeof copy>).lastEdited;
  for (const volume of copy.volumes ?? [])
    for (const chapter of volume.chapters ?? []) {
      delete chapter.content;
      delete chapter.contentLoaded;
      delete (chapter as Partial<Chapter>).lastEdited;
    }
  return canonicalStringify(copy);
}

function targetConflicts(context: ImportPlanContext, plan: ImportPlan): void {
  const target = context.task.draft.target;
  if (target.kind !== 'existing' || target.basis === 'user') return;
  const selected = context.task.draft.novelScope.candidates.find(
    (candidate) => candidate.id === context.task.draft.novelScope.selectedCandidateId,
  );
  const candidates = context.allBooks.filter(
    (book) =>
      selected &&
      (book.title === selected.title || book.alternateTitles?.includes(selected.title)) &&
      (!selected.author || book.author === selected.author),
  );
  if (candidates.length !== 1 || candidates[0]?.id !== target.bookId)
    plan.conflicts.push({
      code: 'TARGET_CONFIRMATION_REQUIRED',
      message: '目标身份或版本尚不明确，请明确选择更新目标',
    });
}

function borrowedParagraphs(group: ImportChapterMatch[], consumed: Set<string>) {
  const borrowed = new Map<string, Set<string>>();
  for (const match of group)
    for (const ref of match.draft.content)
      if (ref.kind === 'existing' && !consumed.has(ref.chapterId)) {
        const ids = borrowed.get(ref.chapterId) ?? new Set<string>();
        ids.add(ref.paragraphId);
        borrowed.set(ref.chapterId, ids);
      }
  return borrowed;
}

function readGroupParagraphs(
  context: ImportPlanContext,
  consumed: Set<string>,
  borrowed: Map<string, Set<string>>,
  draftChapterId: string,
  plan: ImportPlan,
): ImportOldParagraph[] | undefined {
  const old: ImportOldParagraph[] = [];
  const chapters = (context.snapshot?.book.volumes ?? []).flatMap(
    (volume) => volume.chapters ?? [],
  );
  for (const chapter of chapters) {
    if (!consumed.has(chapter.id) && !borrowed.has(chapter.id)) continue;
    const content = context.snapshot!.chapters[chapter.id];
    if (content?.kind === 'failed') {
      plan.conflicts.push({
        code: 'BOOK_READ_FAILED',
        message: `“${typeof chapter.title === 'string' ? chapter.title : chapter.title.original}”正文读取失败：${content.message}`,
        chapterId: draftChapterId,
      });
      return undefined;
    }
    if (
      context.allBooks.some(
        (book) =>
          book.id !== context.snapshot?.book.id &&
          book.volumes?.some((entry) => entry.chapters?.some((item) => item.id === chapter.id)),
      )
    ) {
      plan.conflicts.push({
        code: 'SHARED_CHAPTER_ID',
        message: '旧数据中多个小说共用了章节标识，不能安全覆盖',
        chapterId: chapter.id,
      });
      return undefined;
    }
    if (content?.kind === 'loaded')
      for (const paragraph of content.content)
        if (consumed.has(chapter.id) || borrowed.get(chapter.id)?.has(paragraph.id))
          old.push({ chapterId: chapter.id, paragraph });
  }
  return old;
}

function groupScope(
  context: ImportPlanContext,
  group: ImportChapterMatch[],
  plan: ImportPlan,
):
  | { old: ImportOldParagraph[]; consumed: Set<string>; borrowed: Map<string, Set<string>> }
  | undefined {
  const consumed = new Set(group.flatMap((match) => match.oldIds));
  const borrowed = borrowedParagraphs(group, consumed);
  const excluded = context.task.draft.chapters.filter(
    (chapter) => !context.chapters.some((ready) => ready.id === chapter.id),
  );
  const excludedMatches = matchImportChapters({ ...context, chapters: excluded }, []);
  if (
    excludedMatches.some(
      (match) =>
        match.oldIds.some((id) => consumed.has(id)) ||
        match.draft.content.some((ref) => ref.kind === 'existing' && consumed.has(ref.chapterId)),
    )
  ) {
    plan.conflicts.push({
      code: 'PARTIAL_RESTRUCTURE',
      message: '同一重组范围包含未选择或未取得内容的章节，请完整选择该范围或调整对应关系',
      chapterId: group[0]!.draft.id,
    });
    return undefined;
  }
  const old = readGroupParagraphs(context, consumed, borrowed, group[0]!.draft.id, plan);
  return old ? { old, consumed, borrowed } : undefined;
}

async function resolveGroup(
  context: ImportPlanContext,
  group: ImportChapterMatch[],
  plan: ImportPlan,
  chapterIds: UniqueIdGenerator,
  paragraphIds: UniqueIdGenerator,
  claimed: Set<string>,
  parser: ImportParsingClient,
  signal?: AbortSignal,
): Promise<{ chapters: ResolvedImportChapter[]; consumed: Set<string> }> {
  const scope = groupScope(context, group, plan);
  if (!scope) return { chapters: [], consumed: new Set() };
  const next: ImportNewParagraph[] = [];
  const ids = new Map<string, string>();
  try {
    for (const match of group) {
      const { match: _match, ...plain } = match.draft;
      await context.validator.chapter(context.task.draft, plain, 'user');
      const id = match.oldIds.find((old) => !claimed.has(old)) ?? chapterIds.generate();
      claimed.add(id);
      ids.set(match.draft.id, id);
      next.push(...(await assembleImportParagraphs(context, match.draft, id, paragraphIds)));
    }
  } catch (error) {
    plan.conflicts.push({
      code:
        error instanceof Error
          ? (/^([A-Z_]+):/.exec(error.message)?.[1] ?? 'INVALID_CONTENT_REF')
          : 'INVALID_CONTENT_REF',
      message: String(error),
      chapterId: group[0]!.draft.id,
    });
    return { chapters: [], consumed: new Set() };
  }
  const allowed =
    context.task.draft.replacementConsents
      ?.filter(
        (consent) =>
          consent.bookId === plan.targetBookId && consent.bookRevision === plan.baseBookRevision,
      )
      .map((consent) => consent.signature) ?? [];
  const result = (
    await parser.run(
      {
        kind: 'match',
        input: {
          scopeId: `${plan.targetBookId}:${plan.baseBookRevision}`,
          old: scope.old,
          next,
          allowedReplacements: allowed,
        },
      },
      signal ? { signal } : {},
    )
  ).value;
  plan.paragraphChanges.push(...result.changes);
  plan.replacements!.push(...result.replacements);
  plan.conflicts.push(
    ...result.conflicts.map((conflict) => ({
      code: conflict.code,
      message: conflict.message,
      chapterId: group[0]!.draft.id,
    })),
  );
  const resolved = group.map((match) => ({
    match,
    id: ids.get(match.draft.id)!,
    content: result.paragraphs
      .filter((entry) => entry.chapterId === ids.get(match.draft.id))
      .map((entry) => entry.paragraph),
  }));
  for (const entry of resolved) {
    plan.chapters.push({ chapterId: entry.id, content: entry.content });
    plan.mappings.push({
      draftChapterId: entry.match.draft.id,
      chapterId: entry.id,
      sourceIds: entry.match.draft.sourceIds,
    });
    plan.chapterChanges!.push({
      draftChapterId: entry.match.draft.id,
      chapterId: entry.id,
      oldChapterIds: importChapterOrigins(entry.match),
      kind:
        entry.match.oldIds.length === 1 && group.length === 1
          ? 'update'
          : entry.match.oldIds.length || scope.borrowed.size
            ? 'restructure'
            : 'insert',
      title: entry.match.draft.title,
    });
  }
  for (const [chapterId, moved] of scope.borrowed) {
    const before = context.snapshot!.chapters[chapterId];
    if (before?.kind === 'loaded')
      plan.chapters.push({
        chapterId,
        content: before.content.filter((paragraph) => !moved.has(paragraph.id)),
      });
  }
  return { chapters: resolved, consumed: scope.consumed };
}

function belongsTo(
  source: ImportSource,
  roots: string[],
  sources: Map<string, ImportSource>,
): boolean {
  const seen = new Set<string>();
  let current: ImportSource | undefined = source;
  while (current && !seen.has(current.id)) {
    if (roots.includes(current.id)) return true;
    seen.add(current.id);
    current = current.parentSourceId ? sources.get(current.parentSourceId) : undefined;
  }
  return false;
}

async function completeness(context: ImportPlanContext, plan: ImportPlan): Promise<void> {
  const selected = context.task.draft.novelScope.candidates.find(
    (candidate) => candidate.id === context.task.draft.novelScope.selectedCandidateId,
  );
  const urls = new Map<string, string>();
  const catalogPages = new Set<string>();
  const firstPages = new Set<string>();
  const nextPages = new Set<string>();
  let terminal = false;
  for (const source of context.sources.values()) {
    if (
      !selected ||
      !source.url ||
      !source.currentSnapshotId ||
      !belongsTo(source, selected.sourceIds, context.sources)
    )
      continue;
    const adapter = NovelScraperFactory.getScraper(source.url);
    if (!adapter) continue;
    const snapshot = await context.resource(source.currentSnapshotId);
    if (snapshot.kind !== 'snapshot' || snapshot.text === undefined) continue;
    try {
      const page = adapter.parseNovelSnapshot(snapshot.text, source.url);
      if (!page.info.chapters.length) continue;
      catalogPages.add(source.url);
      firstPages.add(page.catalogStartUrl);
      for (const chapter of page.info.chapters) urls.set(chapter.url, chapter.title);
      for (const next of page.nextPageUrls) nextPages.add(next);
      terminal ||= page.nextPageUrls.length === 0;
    } catch {
      /* 通用来源的完整性保持未知，不把当前发现数量当整本总数。 */
    }
  }
  const covered = new Set(
    context.chapters.flatMap((chapter) =>
      chapter.sourceIds.flatMap((id) => {
        const source = context.sources.get(id);
        const replaced = source?.replacesSourceId
          ? context.sources.get(source.replacesSourceId)
          : source;
        return replaced?.url ? [replaced.url + (replaced.anchor ?? '')] : [];
      }),
    ),
  );
  const missing = new Set(context.task.draft.completeness.missing);
  for (const [url, title] of urls) if (!covered.has(url)) missing.add(title);
  for (const chapter of context.task.draft.chapters)
    if (!chapter.selected || chapter.status !== 'ready')
      missing.add(`${chapter.title}（${chapter.selected ? '未取得正文' : '未选择'}）`);
  const completeCatalog =
    urls.size > 0 &&
    terminal &&
    firstPages.size === 1 &&
    [...firstPages, ...nextPages].every((url) => catalogPages.has(url));
  plan.completeness = {
    confirmed: completeCatalog,
    ...(completeCatalog ? { knownTotal: urls.size } : {}),
    missing: [...missing],
  };
}

function summarize(context: ImportPlanContext, plan: ImportPlan): void {
  const changed = plan.paragraphChanges;
  const hasChanges =
    !context.snapshot ||
    comparableBook(context.snapshot.book) !== comparableBook(plan.book) ||
    changed.some((change) => change.kind !== 'retain');
  if (hasChanges) plan.book.lastEdited = new Date(plan.createdAt);
  plan.summary = {
    selectedChapters: context.chapters.length,
    insertedParagraphs: changed.filter((change) => change.kind === 'insert').length,
    revisedParagraphs: changed.filter((change) => change.kind === 'revise').length,
    movedParagraphs: changed.filter((change) => change.kind === 'move').length,
    removedParagraphs: changed.filter((change) => change.kind === 'remove').length,
    clearedParagraphs: changed.filter((change) => change.clearedVersions > 0).length,
    clearedVersions: changed.reduce((total, change) => total + change.clearedVersions, 0),
    hasChanges,
    partial: !plan.completeness.confirmed || plan.completeness.missing.length > 0,
  };
}

async function savePlan(
  context: ImportPlanContext,
  plan: ImportPlan,
  options: ImportTaskMutationOptions<ImportPlan>,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['books', 'book-revisions', 'import-tasks', 'import-operations', 'import-events'],
    'readwrite',
  );
  await completeIdbTransaction(tx, async () => {
    const task = await tx.objectStore('import-tasks').get(plan.taskId);
    if (!task || task.draft.revision !== plan.draftRevision)
      throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
    checkImportRun(task, options.run);
    const revision = (await tx.objectStore('book-revisions').get(plan.targetBookId))?.revision ?? 0;
    const exists = await tx.objectStore('books').getKey(plan.targetBookId);
    if (
      revision !== plan.baseBookRevision ||
      (plan.targetKind === 'existing') !== (exists !== undefined)
    )
      throw new Error('PLAN_STALE: 目标小说已变化');
    if (
      task.pendingQuestion?.required &&
      task.pendingQuestion.id !== context.task.pendingQuestion?.id
    )
      throw new Error('PLAN_STALE: 有新的必要问题待处理');
    const operation: ImportOperation = {
      id: plan.operationId,
      taskId: task.id,
      plan,
      state: 'planned',
      pendingMaintenance: [],
    };
    await tx.objectStore('import-operations').add(operation);
    task.currentPlanId = plan.id;
    if (!options.run && !task.pendingQuestion?.required)
      task.state = plan.conflicts.length ? 'draft' : 'ready';
    await finishImportTask(task, options.finish?.(plan), {
      toolEvents: (id, callId) =>
        tx.objectStore('import-events').index('by-task-call').getAll([id, callId]),
      event: (event) => tx.objectStore('import-events').add(event),
      task: (updated) => tx.objectStore('import-tasks').put(updated),
    });
  });
}

export class ImportPlanService {
  static async preview(
    taskId: string,
    revision: number,
    options: ImportTaskMutationOptions<ImportPlan> & { signal?: AbortSignal } = {},
  ): Promise<ImportPlan> {
    const context = await loadImportPlanContext(taskId, revision);
    const id = crypto.randomUUID();
    const targetBookId = context.snapshot?.book.id ?? crypto.randomUUID();
    const plan: ImportPlan = {
      id,
      operationId: id,
      taskId,
      draftRevision: revision,
      targetBookId,
      targetKind: context.snapshot ? 'existing' : 'new',
      baseBookRevision: context.snapshot?.revision ?? 0,
      baseDigest: await fingerprintImportBook(context.snapshot),
      resourceIds: [],
      book: { id: targetBookId, title: '', createdAt: new Date(), lastEdited: new Date() },
      chapters: [],
      removedChapterIds: [],
      paragraphChanges: [],
      metadataChanges: [],
      conflicts: [],
      completeness: { confirmed: false, missing: [] },
      mappings: [],
      replacements: [],
      chapterChanges: [],
      createdAt: Date.now(),
    };
    const parser = new ImportParsingClient();
    // 配方自测必须先于空选择判断：已有书籍只修配方时不算空选择。
    const recipe = await evaluateImportRecipe(context, parser, options.signal);
    if (recipe.change) plan.recipeChange = recipe.change;
    const recipeOnly =
      Boolean(context.snapshot) && ['add', 'replace'].includes(recipe.change?.kind ?? '');
    if (!context.chapters.length && !recipeOnly)
      plan.conflicts.push({ code: 'EMPTY_SELECTION', message: '没有选中已取得正文的章节' });
    if (context.task.pendingQuestion?.required)
      plan.conflicts.push({ code: 'PENDING_QUESTION', message: '请先完成必要选择' });
    targetConflicts(context, plan);
    const matches = matchImportChapters(context, plan.conflicts);
    const paragraphIds = new UniqueIdGenerator(
      Object.values(context.snapshot?.chapters ?? {}).flatMap((entry) =>
        entry.kind === 'loaded' ? entry.content.map((paragraph) => paragraph.id) : [],
      ),
    );
    const chapterIds = new UniqueIdGenerator([...context.occupiedChapterIds]);
    const resolved: ResolvedImportChapter[] = [];
    const consumed = new Set<string>();
    const claimed = new Set<string>();
    for (const group of groupImportChapters(matches)) {
      const result = await resolveGroup(
        context,
        group,
        plan,
        chapterIds,
        paragraphIds,
        claimed,
        parser,
        options.signal,
      );
      resolved.push(...result.chapters);
      for (const id of result.consumed) consumed.add(id);
    }
    plan.removedChapterIds = [...consumed].filter(
      (id) => !resolved.some((entry) => entry.id === id),
    );
    await buildImportBook(context, resolved, consumed, plan);
    applyImportRecipe(
      context,
      plan,
      recipe,
      resolved.flatMap((entry) => entry.match.urls),
    );
    await completeness(context, plan);
    plan.resourceIds = [...context.resources.keys()];
    summarize(context, plan);
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException('预览已取消', 'AbortError');
    await savePlan(context, plan, options);
    return plan;
  }

  static async get(planId: string): Promise<ImportPlan | undefined> {
    return (await (await getDB()).get('import-operations', planId))?.plan;
  }

  /** 合章时由实际用户选择设置来源；不提供给 Agent 工具。 */
  static async chooseChapterSettings(
    taskId: string,
    planId: string,
    draftChapterId: string,
    chapterId: string,
  ): Promise<number> {
    const plan = await this.get(planId);
    const change = plan?.chapterChanges?.find((entry) => entry.draftChapterId === draftChapterId);
    if (!plan || plan.taskId !== taskId || !change?.oldChapterIds.includes(chapterId))
      throw new Error('PLAN_STALE: 章节设置来源不在当前方案中');
    return ImportRepository.mutateTask(taskId, (task) => {
      if (task.draft.revision !== plan.draftRevision || task.currentPlanId !== planId)
        throw new Error('PLAN_STALE: 请重新检查章节设置');
      task.draft.chapterSettingsSources ??= {};
      task.draft.chapterSettingsSources[draftChapterId] = {
        chapterId,
        bookRevision: plan.baseBookRevision,
      };
      task.draft.revision++;
      task.state = 'draft';
      return Promise.resolve(task.draft.revision);
    });
  }

  /** 实际用户在已保存方案中选择替换范围；不提供给 Agent 工具。 */
  static async confirmReplacement(
    taskId: string,
    planId: string,
    signature: string,
  ): Promise<number> {
    const plan = await this.get(planId);
    if (
      !plan ||
      plan.taskId !== taskId ||
      !plan.replacements?.some((entry) => entry.signature === signature)
    )
      throw new Error('PLAN_STALE: 替换范围不存在');
    return ImportRepository.mutateTask(taskId, (task) => {
      if (task.draft.revision !== plan.draftRevision || task.currentPlanId !== planId)
        throw new Error('PLAN_STALE: 请重新检查替换范围');
      task.draft.replacementConsents ??= [];
      task.draft.replacementConsents.push({
        signature,
        bookId: plan.targetBookId,
        bookRevision: plan.baseBookRevision,
      });
      task.draft.revision++;
      task.state = 'draft';
      return Promise.resolve(task.draft.revision);
    });
  }
}
