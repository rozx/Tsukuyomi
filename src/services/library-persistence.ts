import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { Novel, Chapter, Paragraph } from 'src/models/novel';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import { serializeDates } from 'src/utils/serialize-dates';
import { canonicalStringify } from 'src/utils/canonical-json';
import { bumpBookRevision } from './book-revision';
import { mergeBookDeletionRecords } from './sync-config-persistence';

const STORES = ['books', 'chapter-contents', 'book-revisions', 'sync-configs'] as const;
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

export function serializeBookRecord(book: Novel): Novel {
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
  for (const volume of record.volumes ?? []) {
    for (const chapter of volume.chapters ?? []) delete chapter.contentLoaded;
  }
  return canonicalStringify(record);
}

function sameContent(prior: string, current: string): boolean {
  if (prior === current) return true;
  try {
    return canonicalStringify(JSON.parse(prior)) === canonicalStringify(JSON.parse(current));
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

async function putChapter(
  tx: Transaction,
  record: ChapterRecord,
  legacy?: { content: Paragraph[] | undefined },
): Promise<{ written: boolean; changed: boolean }> {
  const store = tx.objectStore('chapter-contents');
  const prior = await store.get(record.chapterId);
  if (prior && sameContent(prior.content, record.content)) {
    // 旧记录只补所属书籍，不算正文的语义修改，也不触发重新嵌入。
    if (!prior.bookId && record.bookId) await store.put({ ...prior, bookId: record.bookId });
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
      content: JSON.stringify(chapter.content),
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
  for (const id of new Set(ids)) {
    if ((await store.getKey(id)) !== undefined) {
      await store.delete(id);
      changed = true;
    }
  }
  return changed;
}

/** 只处理持久化，不依赖 UI、缓存、网络或模型。 */
export class LibraryPersistence {
  static async saveBooks(
    db: IDBPDatabase<TsukuyomiDB>,
    books: Novel[],
    saveContent = true,
  ): Promise<Changes> {
    const prepared = books.map((book) => ({
      record: serializeBookRecord(book),
      chapters: saveContent
        ? (book.volumes ?? []).flatMap((volume) =>
            (volume.chapters ?? [])
              .filter((chapter) => chapter.content?.length)
              .map(
                (chapter): ChapterRecord => ({
                  chapterId: chapter.id,
                  bookId: book.id,
                  content: JSON.stringify(chapter.content),
                  lastModified: new Date().toISOString(),
                }),
              ),
          )
        : [],
    }));
    return transaction(db, async (tx) => {
      const changes: Changes = new Map();
      for (const { record, chapters } of prepared) {
        const saved: string[] = [];
        const prior = await tx.objectStore('books').get(record.id);
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
        if (metadataChanged || contentChanged)
          await bumpBookRevision(tx.objectStore('book-revisions'), record.id);
        if (saved.length) changes.set(record.id, [...(changes.get(record.id) ?? []), ...saved]);
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
    const record: ChapterRecord = {
      bookId,
      chapterId,
      content: JSON.stringify(content),
      lastModified: new Date().toISOString(),
    };
    return transaction(db, async (tx) => {
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
      if (includeBooks) await tx.objectStore('books').clear();
      return changes;
    });
  }
}
