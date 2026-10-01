import { indexBookChapters } from 'src/utils/book-chapters';
import { normalizeBookLanguages, normalizeChapterLanguages } from './localization/normalize';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { Novel, Chapter, Paragraph } from 'src/models/novel';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import { serializeDates } from 'src/utils/serialize-dates';
import { canonicalStringify } from 'src/utils/canonical-json';
import { bumpBookRevision } from './book-revision';
import { mergeBookDeletionRecords } from './sync-config-persistence';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import {
  applyBookEntityEdit,
  collectBookRevisions,
  collectParagraphRevisions,
  identifyEntityUpdates,
} from './localization/entity-edit';
import type { EntityUpdates } from './localization/entity-edit';
import { observeSyncRevisions, reserveSyncRevision } from './localization/clock';
import {
  completeRestoreOperation,
  markBookRestoreApplied,
  prepareBookRestore,
  restoreOperationApplied,
} from './localization/restore';
import { mergeBookEntityState } from './localization/entities';
import { preserveStoredTitleSlots } from './localization/title-merge';
import type { CharacterSetting, Terminology } from 'src/models/novel';
import { applyParagraphTranslationEdits } from './localization/paragraph-edit';
import type {
  ParagraphTranslationEdit,
  ChapterTranslationEditGroup,
} from './localization/paragraph-edit';
import { applyTitleEdit } from './localization/title-edit';
import type { TitleEdit } from './localization/title-edit';
import { applyBookFieldPatch } from './book-field-patch';
import type { BookFieldPatch } from './book-field-patch';

const STORES = [
  'books',
  'chapter-contents',
  'book-revisions',
  'sync-configs',
  'sync-chapter-baselines',
  'sync-metadata',
  'entity-operations',
] as const;
type Transaction = IDBPTransaction<TsukuyomiDB, typeof STORES, 'readwrite'>;
type ChapterRecord = TsukuyomiDB['chapter-contents']['value'];
type Changes = Map<string, string[]>;

function stripContent(chapter: Chapter): Chapter {
  const {
    content,
    summary: _droppedSummary,
    ...metadata
  } = chapter as Chapter & { summary?: unknown };
  return { ...metadata, contentLoaded: content !== undefined };
}

export function serializeBookRecord(input: Novel): Novel {
  const book = normalizeBookLanguages(input);
  return serializeDates({
    ...book,
    ...(book.volumes
      ? {
          volumes: book.volumes.map((volume) => ({
            ...volume,
            chapters: volume.chapters?.map(stripContent),
          })),
        }
      : {}),
  });
}

function semanticBook(book: Novel | undefined): string {
  if (!book) return '';
  const record = serializeBookRecord(book);
  Object.assign(record, mergeBookEntityState(record, record));
  for (const volume of record.volumes ?? []) {
    for (const chapter of volume.chapters ?? []) delete chapter.contentLoaded;
  }
  return canonicalStringify(record);
}

function sameContent(prior: string, current: string): boolean {
  if (prior === current) return true;
  try {
    return (
      canonicalStringify(normalizeChapterLanguages(JSON.parse(prior))) ===
      canonicalStringify(normalizeChapterLanguages(JSON.parse(current)))
    );
  } catch {
    return false;
  }
}

async function transaction<T>(
  db: IDBPDatabase<TsukuyomiDB>,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(STORES, 'readwrite');
  return completeIdbTransaction(tx, () => work(tx));
}

/** 预留版本与编辑事务间遇到更高版本时重新预留；失败版本不会重用。 */
async function reservedEditTransaction<T>(
  db: IDBPDatabase<TsukuyomiDB>,
  observed: () => readonly SyncRevision[],
  work: (tx: Transaction, revision: SyncRevision) => Promise<T | undefined>,
  conflictCode: string,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const revision = await reserveSyncRevision(db, observed());
    const result = await transaction(db, (tx) => work(tx, revision));
    if (result !== undefined) return result;
  }
  throw new Error(conflictCode);
}

async function readEditableBook(
  tx: Transaction,
  bookId: string,
  expectedBookLanguage?: AppLocale,
): Promise<Novel> {
  const stored = await tx.objectStore('books').get(bookId);
  if (!stored) throw new Error('BOOK_MISSING');
  const book = normalizeBookLanguages(stored);
  if (expectedBookLanguage && book.targetLanguage !== expectedBookLanguage)
    throw new Error('BOOK_TARGET_LANGUAGE_CHANGED');
  return book;
}

async function putChapter(
  tx: Transaction,
  record: ChapterRecord,
  legacy?: { content: Paragraph[] | undefined },
): Promise<{ written: boolean; changed: boolean }> {
  const store = tx.objectStore('chapter-contents');
  const prior = await store.get(record.chapterId);
  if (prior && sameContent(prior.content, record.content)) {
    // 旧记录只补所属书籍，不算正文的语义修改，也不触发重新嵌入。
    if (prior.content !== record.content || (!prior.bookId && record.bookId)) {
      await store.put({
        ...prior,
        content: record.content,
        ...(record.bookId ? { bookId: record.bookId } : {}),
      });
    }
    return { written: false, changed: false };
  }
  let embedded = legacy?.content;
  if (!prior && !legacy && record.bookId) {
    const book = await tx.objectStore('books').get(record.bookId);
    embedded = book?.volumes
      ?.flatMap((volume) => volume.chapters ?? [])
      .find((chapter) => chapter.id === record.chapterId)?.content;
  }
  await store.put(record);
  return {
    written: true,
    changed:
      prior !== undefined ||
      embedded === undefined ||
      !sameContent(JSON.stringify(embedded), record.content),
  };
}

async function migrateEmbeddedChapters(
  tx: Transaction,
  record: Novel,
  embedded: Map<string, Chapter>,
  saved: string[],
): Promise<void> {
  const retained = new Set(chapterIds(record));
  const store = tx.objectStore('chapter-contents');
  for (const chapter of embedded.values()) {
    if (!retained.has(chapter.id) || (await store.getKey(chapter.id)) !== undefined) continue;
    await store.put({
      chapterId: chapter.id,
      bookId: record.id,
      content: canonicalStringify(normalizeChapterLanguages(chapter.content)),
      lastModified: String(chapter.lastEdited),
    });
    saved.push(chapter.id);
  }
}

function chapterIds(book: Novel): string[] {
  return (book.volumes ?? []).flatMap((volume) =>
    (volume.chapters ?? []).map((chapter) => chapter.id),
  );
}

async function removeChapters(tx: Transaction, ids: string[]): Promise<boolean> {
  let changed = false;
  const store = tx.objectStore('chapter-contents');
  const baselines = tx.objectStore('sync-chapter-baselines');
  for (const id of new Set(ids)) {
    // 章节不存在后，其同步结构基准也失去意义。
    await baselines.delete(id);
    if ((await store.getKey(id)) !== undefined) {
      await store.delete(id);
      changed = true;
    }
  }
  return changed;
}

async function removeBookBaselines(tx: Transaction, bookId: string): Promise<void> {
  const store = tx.objectStore('sync-chapter-baselines');
  for (const key of await store.index('by-bookId').getAllKeys(bookId)) await store.delete(key);
}

async function assertForceChapterSources(
  tx: Transaction,
  source: Novel,
  current: Novel,
): Promise<void> {
  const existing = indexBookChapters(current);
  for (const chapter of (source.volumes ?? []).flatMap((volume) => volume.chapters ?? [])) {
    await assertForceChapterSource(tx, chapter, existing.get(chapter.id));
  }
}

async function assertForceChapterSource(
  tx: Transaction,
  chapter: Chapter,
  original: Chapter | undefined,
): Promise<void> {
  const stored = await tx.objectStore('chapter-contents').get(chapter.id);
  const embedded = original?.content;
  const previous =
    stored?.content ??
    (embedded !== undefined ? canonicalStringify(normalizeChapterLanguages(embedded)) : undefined);
  if (chapter.content === undefined) {
    if (previous !== undefined) throw new Error('FORCE_SOURCE_UNREADABLE');
  } else if (
    previous !== undefined &&
    !sameContent(previous, canonicalStringify(normalizeChapterLanguages(chapter.content)))
  )
    throw new Error('FORCE_SOURCE_CHANGED');
}

async function putForceChapters(
  tx: Transaction,
  desired: Novel,
): Promise<{ changed: boolean; chapterIds: string[] }> {
  let changed = false;
  const chapterIds: string[] = [];
  for (const volume of desired.volumes ?? [])
    for (const chapter of volume.chapters ?? []) {
      if (chapter.content === undefined) continue;
      const result = await putChapter(tx, {
        chapterId: chapter.id,
        bookId: desired.id,
        content: canonicalStringify(normalizeChapterLanguages(chapter.content)),
        lastModified: new Date().toISOString(),
      });
      changed ||= result.changed;
      if (result.written) chapterIds.push(chapter.id);
    }
  return { changed, chapterIds };
}

async function replaceLibraryRecords(
  tx: Transaction,
  prepared: Novel[],
  originalIds: string[],
): Promise<void> {
  await tx.objectStore('books').clear();
  await tx.objectStore('chapter-contents').clear();
  await tx.objectStore('sync-chapter-baselines').clear();
  for (const book of prepared) {
    await tx.objectStore('books').put(serializeBookRecord(book));
    for (const volume of book.volumes ?? [])
      for (const chapter of volume.chapters ?? []) {
        if (chapter.content !== undefined)
          await tx.objectStore('chapter-contents').put({
            chapterId: chapter.id,
            bookId: book.id,
            content: canonicalStringify(normalizeChapterLanguages(chapter.content)),
            lastModified: String(chapter.lastEdited),
          });
      }
  }
  await observeSyncRevisions(
    tx.objectStore('sync-metadata'),
    prepared.flatMap(collectBookRevisions),
  );
  for (const id of new Set([...originalIds, ...prepared.map((book) => book.id)]))
    await bumpBookRevision(tx.objectStore('book-revisions'), id);
}

/** 有语义修改时递增书籍修改序号，否则读取当前序号；返回提交后记录对应的序号。 */
async function commitBookRevision(tx: Transaction, bookId: string, changed: boolean) {
  const store = tx.objectStore('book-revisions');
  if (changed) return bumpBookRevision(store, bookId);
  return (await store.get(bookId))?.revision ?? 0;
}

/** 只处理持久化，不依赖 UI、缓存、网络或模型。 */
export class LibraryPersistence {
  static async editTitle(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    language: AppLocale,
    edit: TitleEdit,
    expectedBookLanguage?: AppLocale,
  ): Promise<Novel> {
    if (!isAppLocale(language)) throw new Error('INVALID_LOCALE');
    let observed: SyncRevision[] = [];
    return reservedEditTransaction(
      db,
      () => observed,
      async (tx, revision) => {
        const current = await readEditableBook(tx, bookId, expectedBookLanguage);
        observed = collectBookRevisions(current);
        if (observed.some((value) => value.counter >= revision.counter)) return undefined;
        const next = serializeBookRecord(
          applyTitleEdit(current, language, edit, revision, Date.now()),
        );
        await tx.objectStore('books').put(next);
        await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
        return next;
      },
      'TITLE_EDIT_CONFLICT',
    );
  }

  static async editParagraphTranslations(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    chapterId: string,
    language: AppLocale,
    edits: readonly ParagraphTranslationEdit[],
    expectedBookLanguage?: AppLocale,
  ): Promise<{ book: Novel; content: Paragraph[] }> {
    const result = await this.editParagraphTranslationGroups(
      db,
      bookId,
      language,
      [{ chapterId, edits }],
      expectedBookLanguage,
    );
    return { book: result.book, content: result.contents.get(chapterId)! };
  }

  /** 同一书籍内跨章节的编辑一起验证、提交；模型等待期的旧卷章快照不写回。 */
  static async editParagraphTranslationGroups(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    language: AppLocale,
    groups: readonly ChapterTranslationEditGroup[],
    expectedBookLanguage?: AppLocale,
  ): Promise<{ book: Novel; contents: Map<string, Paragraph[]> }> {
    if (
      !isAppLocale(language) ||
      (expectedBookLanguage !== undefined && !isAppLocale(expectedBookLanguage))
    )
      throw new Error('INVALID_LOCALE');
    if (new Set(groups.map((group) => group.chapterId)).size !== groups.length)
      throw new Error('DUPLICATE_EDIT_CHAPTER');
    if (!groups.length)
      return transaction(db, async (tx) => ({
        book: await readEditableBook(tx, bookId, expectedBookLanguage),
        contents: new Map(),
      }));
    let observed: SyncRevision[] = [];
    return reservedEditTransaction(
      db,
      () => observed,
      async (tx, revision) => {
        const book = await readEditableBook(tx, bookId, expectedBookLanguage);
        const chapters = indexBookChapters(book);
        const loaded = [];
        for (const group of groups) {
          const chapter = chapters.get(group.chapterId);
          if (!chapter) throw new Error('CHAPTER_MISSING');
          const prior = await tx.objectStore('chapter-contents').get(group.chapterId);
          if (prior?.bookId && prior.bookId !== bookId) throw new Error('CHAPTER_BOOK_MISMATCH');
          const content = normalizeChapterLanguages(
            prior ? JSON.parse(prior.content) : (chapter.content ?? []),
          );
          loaded.push({ group, chapter, content });
        }
        observed = [
          ...collectBookRevisions(book),
          ...loaded.flatMap((entry) => collectParagraphRevisions(entry.content)),
        ];
        if (observed.some((value) => value.counter >= revision.counter)) return undefined;
        const updatedAt = Date.now();
        // 所有原文/版本检查通过后才开始写；后续失败由同一 IndexedDB 事务回滚。
        const updated = loaded.map(({ group, chapter, content }) => ({
          group,
          chapter,
          content: applyParagraphTranslationEdits(
            content,
            language,
            group.edits,
            revision,
            updatedAt,
          ),
        }));
        const contents = new Map(updated.map((entry) => [entry.group.chapterId, entry.content]));
        const changedIds = new Set<string>();
        for (const entry of updated) {
          const result = await putChapter(
            tx,
            {
              chapterId: entry.group.chapterId,
              bookId,
              content: canonicalStringify(entry.content),
              lastModified: new Date(updatedAt).toISOString(),
            },
            { content: entry.chapter.content },
          );
          if (result.changed) changedIds.add(entry.group.chapterId);
        }
        if (!changedIds.size) return { book, contents };
        const lastEdited = new Date(updatedAt);
        const next = serializeBookRecord({
          ...book,
          lastEdited,
          volumes: book.volumes?.map((volume) => ({
            ...volume,
            chapters: volume.chapters?.map((chapter) =>
              changedIds.has(chapter.id) ? { ...chapter, lastEdited } : chapter,
            ),
          })),
        });
        await tx.objectStore('books').put(next);
        await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
        return { book: next, contents };
      },
      'PARAGRAPH_EDIT_CONFLICT',
    );
  }

  /** 内部失败回滚：保留备份身份与协议值，设备计数和操作分配记录不回退。 */
  static async rollbackBooks(db: IDBPDatabase<TsukuyomiDB>, books: Novel[]): Promise<void> {
    const prepared = books.map(normalizeBookLanguages);
    await transaction(db, async (tx) => {
      const original = await tx.objectStore('books').getAll();
      await replaceLibraryRecords(
        tx,
        prepared,
        original.map((book) => book.id),
      );
    });
  }

  /** 只应用已确认的强制协议结果，任何准备期间的业务修改使旧结果失效。 */
  static async commitForceBooks(
    db: IDBPDatabase<TsukuyomiDB>,
    sources: Novel[],
    prepared: Novel[],
  ): Promise<Changes> {
    if (sources.length !== prepared.length) throw new Error('INVALID_FORCE_SNAPSHOT');
    return transaction(db, async (tx) => {
      const changes: Changes = new Map();
      for (const source of sources) {
        const desired = prepared.find((book) => book.id === source.id);
        const current = await tx.objectStore('books').get(source.id);
        if (!desired || !current || semanticBook(current) !== semanticBook(source))
          throw new Error('FORCE_SOURCE_CHANGED');
        await assertForceChapterSources(tx, source, current);
        const record = serializeBookRecord(desired);
        let changed = semanticBook(current) !== semanticBook(record);
        const written = await putForceChapters(tx, desired);
        changed ||= written.changed;
        const chapterIds = written.chapterIds;
        await tx.objectStore('books').put(record);
        if (changed) await bumpBookRevision(tx.objectStore('book-revisions'), source.id);
        if (chapterIds.length) changes.set(source.id, chapterIds);
      }
      await observeSyncRevisions(
        tx.objectStore('sync-metadata'),
        prepared.flatMap(collectBookRevisions),
      );
      return changes;
    });
  }

  /** 显式书库覆盖先准备所有恢复回执，再在一个事务中替换书籍和正文。 */
  static async replaceBooks(
    db: IDBPDatabase<TsukuyomiDB>,
    snapshots: Novel[],
    operationId: string,
  ): Promise<void> {
    const signature = canonicalStringify(snapshots.map(normalizeBookLanguages));
    if (
      await restoreOperationApplied(
        { get: (id) => db.get('entity-operations', id) },
        'library',
        operationId,
        signature,
      )
    )
      return;
    const original = await db.getAll('books');
    const current = new Map(original.map((book) => [book.id, normalizeBookLanguages(book)]));
    const chapters = new Map(
      [...current.values()].flatMap((book) =>
        (book.volumes ?? []).flatMap((volume) =>
          (volume.chapters ?? []).map((chapter) => [chapter.id, chapter] as const),
        ),
      ),
    );
    const originalRevisions = await db.getAll('book-revisions');
    for (const record of await db.getAll('chapter-contents')) {
      const chapter = chapters.get(record.chapterId);
      if (chapter) chapter.content = normalizeChapterLanguages(JSON.parse(record.content));
    }
    const prepared: Novel[] = [];
    const ids = new Set<string>();
    for (const snapshot of snapshots) {
      if (!snapshot.id || ids.has(snapshot.id)) throw new Error('INVALID_BOOK_ID');
      ids.add(snapshot.id);
      prepared.push(await prepareBookRestore(db, snapshot, current.get(snapshot.id), operationId));
    }
    await transaction(db, async (tx) => {
      if (
        await restoreOperationApplied(
          tx.objectStore('entity-operations'),
          'library',
          operationId,
          signature,
        )
      )
        return;
      if (
        canonicalStringify(await tx.objectStore('books').getAll()) !==
          canonicalStringify(original) ||
        canonicalStringify(await tx.objectStore('book-revisions').getAll()) !==
          canonicalStringify(originalRevisions)
      )
        throw new Error('RESTORE_SOURCE_CHANGED');
      await replaceLibraryRecords(
        tx,
        prepared,
        original.map((book) => book.id),
      );
      await completeRestoreOperation(
        tx.objectStore('entity-operations'),
        'library',
        operationId,
        signature,
        prepared.map((book) => book.id),
      );
    });
  }

  static async restoreEntity<T extends Terminology | CharacterSetting>(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    kind: 'term' | 'character',
    entity: T,
    operationId: string,
  ): Promise<T> {
    const stored = await db.get('books', bookId);
    if (!stored) throw new Error('BOOK_MISSING');
    const current = normalizeBookLanguages(stored);
    const desired: Novel = {
      id: bookId,
      title: '',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      ...(kind === 'term'
        ? { terminologies: [entity as Terminology] }
        : { characterSettings: [entity as CharacterSetting] }),
    };
    const scoped = {
      ...current,
      volumes: undefined,
      terminologies: current.terminologies?.filter(
        (value) => kind === 'term' && value.id === entity.id,
      ),
      characterSettings: current.characterSettings?.filter(
        (value) => kind === 'character' && value.id === entity.id,
      ),
    };
    const restored = await prepareBookRestore(db, desired, scoped, operationId);
    return transaction(db, async (tx) => {
      const latest = await tx.objectStore('books').get(bookId);
      if (!latest) throw new Error('BOOK_MISSING');
      const merged = mergeBookEntityState(latest, restored);
      const restoredId =
        kind === 'term' ? restored.terminologies![0]!.id : restored.characterSettings![0]!.id;
      const value = (kind === 'term' ? merged.terminologies : merged.characterSettings)?.find(
        (item) => item.id === restoredId,
      );
      if (!value) throw new Error('ENTITY_DELETED');
      const next = serializeBookRecord({ ...latest, ...merged });
      if (semanticBook(latest) !== semanticBook(next)) {
        next.lastEdited = new Date().toISOString() as unknown as Date;
        await tx.objectStore('books').put(next);
        await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
      }
      await markBookRestoreApplied(tx.objectStore('entity-operations'), operationId, bookId);
      return value as T;
    });
  }

  static async editEntities(
    db: IDBPDatabase<TsukuyomiDB>,
    base: Novel,
    updates: EntityUpdates,
    locale: AppLocale,
    expectedBookLanguage?: AppLocale,
  ): Promise<Novel> {
    return (await this.commitEntityEdit(db, base, updates, locale, expectedBookLanguage)).book;
  }

  /** 同 editEntities，并返回提交后记录对应的书籍修改序号 */
  static async commitEntityEdit(
    db: IDBPDatabase<TsukuyomiDB>,
    base: Novel,
    updates: EntityUpdates,
    locale: AppLocale,
    expectedBookLanguage?: AppLocale,
  ): Promise<{ book: Novel; revision: number }> {
    const identified = identifyEntityUpdates(normalizeBookLanguages(base), updates);
    let observed = [
      ...collectBookRevisions(normalizeBookLanguages(base)),
      ...collectBookRevisions({ ...base, ...identified }),
    ];
    return reservedEditTransaction(
      db,
      () => observed,
      async (tx, revision) => {
        const current = await readEditableBook(tx, base.id, expectedBookLanguage);
        observed = collectBookRevisions(current);
        // 预留与业务事务之间可能有其他标签页收到新远端版本，重新预留后再提交。
        if (observed.some((value) => value.counter >= revision.counter)) return undefined;
        const next = serializeBookRecord({
          ...current,
          ...applyBookEntityEdit(base, identified, current, locale, revision, Date.now()),
        });
        const changed = semanticBook(current) !== semanticBook(next);
        if (changed) {
          next.lastEdited = new Date().toISOString() as unknown as Date;
          await tx.objectStore('books').put(next);
        }
        return { book: next, revision: await commitBookRevision(tx, base.id, changed) };
      },
      'ENTITY_EDIT_CONFLICT',
    );
  }

  /**
   * 按字段增量更新书籍元数据：在读写事务内读取最新记录，只应用补丁字段，
   * 不写回调用方持有的旧快照。补丁无实际变化时不写入、不递增修改序号。
   * @returns 已提交的记录、需维护的章节与该记录对应的书籍修改序号；库中没有该书时返回 undefined
   */
  static async updateBookFields(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    patch: BookFieldPatch,
  ): Promise<{ book: Novel; changes: Changes; revision: number } | undefined> {
    const { lastEdited, ...fields } = patch;
    return transaction(db, async (tx) => {
      const prior = await tx.objectStore('books').get(bookId);
      if (!prior) return undefined;
      const next = serializeBookRecord(applyBookFieldPatch(prior, fields));
      // 卷章原样保留：重新剥离正文会改写已存的 contentLoaded 约定，造成无意义写入
      if (prior.volumes) next.volumes = prior.volumes;
      const changes: Changes = new Map();
      if (semanticBook(prior) === semanticBook(next))
        return { book: prior, changes, revision: await commitBookRevision(tx, bookId, false) };
      next.lastEdited = new Date(lastEdited ?? Date.now()).toISOString() as unknown as Date;
      await tx.objectStore('books').put(next);
      const revision = await commitBookRevision(tx, bookId, true);
      if ((prior.targetLanguage ?? 'zh-CN') !== (next.targetLanguage ?? 'zh-CN'))
        changes.set(bookId, chapterIds(next));
      return { book: next, changes, revision };
    });
  }

  /**
   * @param options.keepStoredTargetLanguage 本次保存不是在修改目标语言：保留库中已存的目标语言，
   *   防止持有旧快照的元数据保存把其他标签页刚改的目标语言改回去
   * @param options.revisions 传入时填入每本书提交后记录对应的修改序号
   */
  static async saveBooks(
    db: IDBPDatabase<TsukuyomiDB>,
    books: Novel[],
    saveContent = true,
    options: { keepStoredTargetLanguage?: boolean; revisions?: Map<string, number> } = {},
  ): Promise<Changes> {
    const prepared = books.map((book) => ({
      observed: collectBookRevisions(normalizeBookLanguages(book)),
      record: serializeBookRecord(book),
      chapters: saveContent
        ? (book.volumes ?? []).flatMap((volume) =>
            (volume.chapters ?? [])
              .filter((chapter) => chapter.content?.length)
              .map(
                (chapter): ChapterRecord => ({
                  chapterId: chapter.id,
                  bookId: book.id,
                  content: canonicalStringify(normalizeChapterLanguages(chapter.content)),
                  lastModified: new Date().toISOString(),
                }),
              ),
          )
        : [],
    }));
    return transaction(db, async (tx) => {
      const changes: Changes = new Map();
      await observeSyncRevisions(
        tx.objectStore('sync-metadata'),
        prepared.flatMap(({ observed }) => observed),
      );
      for (const { record: requested, chapters } of prepared) {
        const saved: string[] = [];
        const prior = await tx.objectStore('books').get(requested.id);
        // 调用方可能持有旧快照：术语/角色状态与卷章标题语言槽都按 revision 与已存储记录合并
        const record = prior
          ? preserveStoredTitleSlots(
              { ...requested, ...mergeBookEntityState(prior, requested) },
              prior,
            )
          : requested;
        if (prior && options.keepStoredTargetLanguage) {
          if (prior.targetLanguage === undefined) delete record.targetLanguage;
          else record.targetLanguage = prior.targetLanguage;
        }
        const embedded = new Map(
          (prior?.volumes ?? []).flatMap((volume) =>
            (volume.chapters ?? [])
              .filter((chapter) => chapter.content !== undefined)
              .map((chapter) => [chapter.id, chapter] as const),
          ),
        );
        let contentChanged = false;
        for (const chapter of chapters) {
          const result = await putChapter(tx, chapter, {
            content: embedded.get(chapter.chapterId)?.content,
          });
          if (result.written) saved.push(chapter.chapterId);
          contentChanged ||= result.changed;
        }
        await migrateEmbeddedChapters(tx, record, embedded, saved);
        const metadataChanged = semanticBook(prior) !== semanticBook(record);
        // 保留原有 contentLoaded 存储约定，但派生标记变化不递增语义序号。
        if (canonicalStringify(prior) !== canonicalStringify(record))
          await tx.objectStore('books').put(record);
        if (metadataChanged || contentChanged || options.revisions) {
          const revision = await commitBookRevision(
            tx,
            record.id,
            metadataChanged || contentChanged,
          );
          options.revisions?.set(record.id, revision);
        }
        const targetChanged =
          prior && (prior.targetLanguage ?? 'zh-CN') !== (record.targetLanguage ?? 'zh-CN');
        if (targetChanged) saved.push(...chapterIds(record));
        if (saved.length)
          changes.set(record.id, [...new Set([...(changes.get(record.id) ?? []), ...saved])]);
      }
      return changes;
    });
  }

  static async saveChapter(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    chapterId: string,
    content: Paragraph[],
  ): Promise<boolean> {
    const normalized = normalizeChapterLanguages(content);
    const record: ChapterRecord = {
      bookId,
      chapterId,
      content: canonicalStringify(normalized),
      lastModified: new Date().toISOString(),
    };
    return transaction(db, async (tx) => {
      await observeSyncRevisions(
        tx.objectStore('sync-metadata'),
        collectParagraphRevisions(normalized),
      );
      const { changed } = await putChapter(tx, record);
      if (changed) await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
      return changed;
    });
  }

  static async deleteChapters(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    ids: string[],
  ): Promise<void> {
    await transaction(db, async (tx) => {
      if (await removeChapters(tx, ids))
        await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
    });
  }

  static async deleteBook(
    db: IDBPDatabase<TsukuyomiDB>,
    bookId: string,
    recordDeletion = false,
  ): Promise<string[]> {
    return transaction(db, async (tx) => {
      const book = await tx.objectStore('books').get(bookId);
      if (!book) return [];
      const ids = chapterIds(book);
      await removeChapters(tx, ids);
      await removeBookBaselines(tx, bookId);
      await tx.objectStore('books').delete(bookId);
      await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
      if (recordDeletion)
        await mergeBookDeletionRecords(tx.objectStore('sync-configs'), [bookId], Date.now());
      return ids;
    });
  }

  static async clear(db: IDBPDatabase<TsukuyomiDB>, includeBooks: boolean): Promise<Changes> {
    return transaction(db, async (tx) => {
      const books = await tx.objectStore('books').getAll();
      const records = await tx.objectStore('chapter-contents').getAll();
      const owners = new Map(
        books.flatMap((book) => chapterIds(book).map((id) => [id, book.id] as const)),
      );
      const changes: Changes = new Map();
      for (const record of records) {
        const owner = record.bookId ?? owners.get(record.chapterId);
        if (owner) changes.set(owner, [...(changes.get(owner) ?? []), record.chapterId]);
      }
      const affected = new Set([
        ...changes.keys(),
        ...(includeBooks ? books.map((book) => book.id) : []),
      ]);
      for (const id of affected) await bumpBookRevision(tx.objectStore('book-revisions'), id);
      await tx.objectStore('chapter-contents').clear();
      await tx.objectStore('sync-chapter-baselines').clear();
      if (includeBooks) await tx.objectStore('books').clear();
      return changes;
    });
  }
}
