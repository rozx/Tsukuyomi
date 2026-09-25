import type { IDBPTransaction } from 'idb';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { BookUpdateRecipe, CatalogEntry, SyncVolumeTarget } from 'src/models/book-sync';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import { getDB } from 'src/utils/indexed-db';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { serializeDates } from 'src/utils/serialize-dates';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { bumpBookRevision } from 'src/services/book-revision';
import { ImportLibraryReader } from 'src/services/import/import-library-reader';
import { maintainLibraryChanges } from 'src/services/chapter-content-maintenance';
import { bookCommitBus } from 'src/services/book-commit-notifications';
import { BookSyncError } from './errors';
import { resolveRecipe } from './recipe';
import { mergeBookDeletionRecords } from 'src/services/sync-config-persistence';

const WRITE_STORES = ['books', 'chapter-contents', 'book-revisions'] as const;
type WriteTransaction = IDBPTransaction<TsukuyomiDB, typeof WRITE_STORES, 'readwrite'>;

type ChapterRecord = TsukuyomiDB['chapter-contents']['value'];
export interface SyncBefore {
  bookId: string;
  book: Novel | null;
  chapters: Map<string, ChapterRecord | null>;
  postRevision: number;
}
export interface SyncWrite {
  entry: CatalogEntry;
  chapterId?: string;
  paragraphs: Paragraph[];
  originalContent: string;
  target?: SyncVolumeTarget;
}

async function captureChapter(
  tx: WriteTransaction,
  book: Novel | undefined,
  write: SyncWrite,
  id: string,
  otherIds: Set<string>,
): Promise<ChapterRecord | null> {
  const chapter = book?.volumes?.flatMap((v) => v.chapters ?? []).find((c) => c.id === id);
  const record = await tx.objectStore('chapter-contents').get(id);
  if (write.chapterId && !chapter) throw new BookSyncError('BOOK_CHANGED', '目标章节已不存在');
  if ((!write.chapterId && record) || otherIds.has(id))
    throw new BookSyncError('BOOK_CHANGED', '章节标识已被占用');
  const fallback =
    chapter?.content !== undefined
      ? {
          chapterId: id,
          content: JSON.stringify(chapter.content),
          lastModified: String(chapter.lastEdited),
        }
      : undefined;
  const loaded = ImportLibraryReader.decodeChapter(record ?? fallback);
  if (loaded.kind === 'failed') throw new BookSyncError('BOOK_READ_FAILED', loaded.message);
  return record ?? null;
}

function resolveVolume(
  book: Novel,
  target: SyncVolumeTarget | undefined,
  created: Map<string, string>,
  ids: UniqueIdGenerator,
) {
  if (!target) throw new BookSyncError('TARGET_VOLUME_MISSING', '新章节缺少目标卷');
  book.volumes ??= [];
  let id = 'volumeId' in target ? target.volumeId : created.get(target.newTitle);
  if (!('volumeId' in target) && !id) {
    id = ids.generate();
    book.volumes.push({ id, title: target.newTitle, chapters: [] });
    created.set(target.newTitle, id);
  }
  const volume = book.volumes.find((v) => v.id === id);
  if (!volume) throw new BookSyncError('TARGET_VOLUME_MISSING', '指定的卷已不存在');
  return volume;
}

function chapterMetadata(write: SyncWrite, now: Date) {
  return {
    webUrl: write.entry.url,
    originalContent: write.originalContent,
    lastEdited: now,
    contentLoaded: true,
    ...(write.entry.lastUpdated ? { lastUpdated: write.entry.lastUpdated } : {}),
  };
}

/** 与 LibraryPersistence 共用事务完成、日期序列化和修改序号工具。 */
export async function commitSyncChanges(input: {
  bookId: string;
  baseRevision: number | null;
  newBook?: Novel;
  writes: SyncWrite[];
  recipe?: BookUpdateRecipe;
}): Promise<SyncBefore> {
  const db = await getDB();
  const tx = db.transaction(WRITE_STORES, 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const current = await tx.objectStore('books').get(input.bookId);
    const revision = (await tx.objectStore('book-revisions').get(input.bookId))?.revision ?? 0;
    if (
      input.baseRevision === null
        ? Boolean(current) || revision !== 0
        : !current || revision !== input.baseRevision
    )
      throw new BookSyncError('BOOK_CHANGED', '书籍已变化，请重新核对变更');
    const next = structuredClone(current ?? input.newBook!);
    const before: SyncBefore = {
      bookId: input.bookId,
      book: current ?? null,
      chapters: new Map(),
      postRevision: 0,
    };
    const allBooks = await tx.objectStore('books').getAll();
    const chaptersOf = (b: Novel) => (b.volumes ?? []).flatMap((v) => v.chapters ?? []);
    const existingChapters = allBooks.flatMap(chaptersOf);
    const otherIds = new Set(
      allBooks
        .filter((b) => b.id !== input.bookId)
        .flatMap(chaptersOf)
        .map((c) => c.id),
    );
    const chapterIds = new UniqueIdGenerator(existingChapters.map((c) => c.id));
    const volumeIds = new UniqueIdGenerator((next.volumes ?? []).map((v) => v.id));
    const createdVolumes = new Map<string, string>();
    const now = new Date();
    for (const write of input.writes) {
      const id = write.chapterId ?? chapterIds.generate();
      before.chapters.set(id, await captureChapter(tx, current, write, id, otherIds));
      const metadata = chapterMetadata(write, now);
      if (write.chapterId) {
        const chapter = next.volumes!.flatMap((v) => v.chapters ?? []).find((c) => c.id === id)!;
        Object.assign(chapter, metadata);
        delete chapter.content;
      } else {
        const volume = resolveVolume(next, write.target, createdVolumes, volumeIds);
        const chapter: Chapter = { id, title: write.entry.title, createdAt: now, ...metadata };
        (volume.chapters ??= []).push(chapter);
      }
      await tx.objectStore('chapter-contents').put({
        chapterId: id,
        bookId: input.bookId,
        content: JSON.stringify(write.paragraphs),
        lastModified: now.toISOString(),
      });
    }
    if (input.recipe) next.updateRecipe = input.recipe;
    if (next.updateRecipe?.skippedUrls) {
      const imported = new Set(input.writes.map((w) => w.entry.url));
      next.updateRecipe.skippedUrls = next.updateRecipe.skippedUrls.filter(
        (e) => !imported.has(e.url),
      );
    }
    next.lastEdited = now;
    // 未受影响的旧式内嵌正文仍留在书籍记录中，避免迁移时丢失。
    await tx.objectStore('books').put(serializeDates(next));
    before.postRevision = await bumpBookRevision(tx.objectStore('book-revisions'), input.bookId);
    return before;
  });
}

export async function notifySyncCommit(before: SyncBefore): Promise<void> {
  const chapterIds = [...before.chapters.keys()];
  await maintainLibraryChanges(new Map([[before.bookId, chapterIds]]));
  try {
    await bookCommitBus.publish({
      bookId: before.bookId,
      revision: before.postRevision,
      chapterIds,
    });
  } catch (error) {
    console.warn('书籍同步已提交，通知刷新失败:', error);
  }
}

export async function undoSyncChanges(before: SyncBefore): Promise<SyncBefore> {
  const db = await getDB();
  const tx = db.transaction(
    ['books', 'chapter-contents', 'book-revisions', 'sync-configs', 'sync-chapter-baselines'],
    'readwrite',
  );
  return completeIdbTransaction(tx, async () => {
    const current = await tx.objectStore('books').get(before.bookId);
    const revision = (await tx.objectStore('book-revisions').get(before.bookId))?.revision ?? 0;
    if (!current || revision !== before.postRevision)
      throw new BookSyncError('BOOK_CHANGED', '书籍已有后续修改，无法撤销');
    for (const [id, record] of before.chapters) {
      if (record) await tx.objectStore('chapter-contents').put(record);
      else {
        await tx.objectStore('chapter-contents').delete(id);
        await tx.objectStore('sync-chapter-baselines').delete(id);
      }
    }
    if (before.book) await tx.objectStore('books').put(before.book);
    else {
      await tx.objectStore('books').delete(before.bookId);
      await mergeBookDeletionRecords(tx.objectStore('sync-configs'), [before.bookId], Date.now());
    }
    return {
      ...before,
      postRevision: await bumpBookRevision(tx.objectStore('book-revisions'), before.bookId),
    };
  });
}

/**
 * 在单个事务内读取书籍、按 patch 修改元数据并递增修改序号（不涉及章节正文）。
 */
async function patchBookRecord(
  bookId: string,
  patch: (book: Novel) => Partial<Novel>,
): Promise<SyncBefore> {
  const tx = (await getDB()).transaction(['books', 'book-revisions'], 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const book = await tx.objectStore('books').get(bookId);
    if (!book) throw new BookSyncError('BOOK_READ_FAILED', '书籍不存在');
    await tx
      .objectStore('books')
      .put(serializeDates({ ...book, ...patch(book), lastEdited: new Date() }));
    return {
      bookId,
      book,
      chapters: new Map(),
      postRevision: await bumpBookRevision(tx.objectStore('book-revisions'), bookId),
    };
  });
}

export async function writeSkipped(
  bookId: string,
  entries: Pick<CatalogEntry, 'url' | 'title'>[],
  skipped: boolean,
): Promise<SyncBefore> {
  return patchBookRecord(bookId, (book) => {
    const recipe = resolveRecipe(book).recipe;
    const known = new Set(
      (book.volumes ?? []).flatMap((v) => (v.chapters ?? []).map((c) => c.webUrl)),
    );
    const ignored = new Map((recipe.skippedUrls ?? []).map((e) => [e.url, e]));
    for (const entry of entries) {
      if (skipped && !known.has(entry.url))
        ignored.set(entry.url, { url: entry.url, title: entry.title });
      else ignored.delete(entry.url);
    }
    recipe.skippedUrls = [...ignored.values()];
    recipe.recordedAt ||= Date.now();
    return { updateRecipe: recipe };
  });
}

/** 逐章修改章节元数据（不涉及正文）；patch 返回原对象表示不改 */
function patchChapters(bookId: string, patch: (chapter: Chapter) => Chapter): Promise<SyncBefore> {
  return patchBookRecord(bookId, (book) => ({
    volumes: (book.volumes ?? []).map((volume) => ({
      ...volume,
      chapters: (volume.chapters ?? []).map(patch),
    })),
  }));
}

/**
 * 记录已比对确认正文未变的章节的远端更新日期（写回章节 lastUpdated），
 * 使下次快速检查按日期判断为无变化，不再重复抓取正文。
 */
export async function writeConfirmedDates(
  bookId: string,
  confirmed: Pick<CatalogEntry, 'url' | 'lastUpdated'>[],
): Promise<SyncBefore> {
  const dates = new Map(
    confirmed.flatMap((e) => (e.lastUpdated ? [[e.url, new Date(e.lastUpdated)] as const] : [])),
  );
  return patchChapters(bookId, (chapter) => {
    const date = chapter.webUrl ? dates.get(chapter.webUrl) : undefined;
    return date ? { ...chapter, lastUpdated: date } : chapter;
  });
}

/**
 * 为手动添加的章节写回推断出的来源网址（仅限仍没有网址的章节），使之后的检查按网址识别。
 */
export async function writeChapterUrls(
  bookId: string,
  links: { chapterId: string; url: string }[],
): Promise<SyncBefore> {
  const urls = new Map(links.map((l) => [l.chapterId, l.url]));
  return patchChapters(bookId, (chapter) => {
    const url = urls.get(chapter.id);
    return url && !chapter.webUrl ? { ...chapter, webUrl: url } : chapter;
  });
}
