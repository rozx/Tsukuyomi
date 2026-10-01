import type { ImportFailure } from 'src/models/import-feedback';
import { importError, serializeImportError } from './import-error';
import { normalizeBookLanguages, normalizeChapterLanguages } from '../localization/normalize';
import type { Novel, Paragraph, Chapter } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { deserializeDates, serializeDates } from 'src/utils/serialize-dates';

type ChapterRecord = { chapterId: string; content: string; lastModified: string };
type ReadFailure = { kind: 'failed'; message: string; error?: ImportFailure };
type ChapterRead =
  | { kind: 'loaded'; content: Paragraph[]; record?: ChapterRecord; storage?: 'embedded' }
  | { kind: 'absent' }
  | ReadFailure;
type BookRead =
  | { kind: 'loaded'; book: Novel; revision: number; chapters: Record<string, ChapterRead> }
  | { kind: 'absent' }
  | ReadFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validParagraph(value: unknown): value is Paragraph {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.text !== 'string' ||
    typeof value.selectedTranslationId !== 'string' ||
    !Array.isArray(value.translations)
  )
    return false;
  const ids = new Set<string>();
  return value.translations.every((t: unknown) => {
    if (
      !isRecord(t) ||
      typeof t.id !== 'string' ||
      !t.id ||
      typeof t.translation !== 'string' ||
      typeof t.aiModelId !== 'string' ||
      ids.has(t.id)
    )
      return false;
    ids.add(t.id);
    return true;
  });
}

function failure(error: unknown): ReadFailure {
  const record = serializeImportError(error, 'BOOK_READ_FAILED');
  return { kind: 'failed', message: record.message, error: record };
}

function embeddedChapter(record: ChapterRecord | undefined, chapter: Chapter): ChapterRead {
  const loaded = ImportLibraryReader.decodeChapter(record);
  if (loaded.kind !== 'absent' || chapter.content === undefined) return loaded;
  const embedded = ImportLibraryReader.decodeChapter({
    chapterId: chapter.id,
    content: JSON.stringify(chapter.content),
    lastModified: String(chapter.lastEdited ?? ''),
  });
  return embedded.kind === 'loaded'
    ? { kind: 'loaded', content: embedded.content, storage: 'embedded' }
    : embedded;
}

/** 严格读取不经过 loader，也不读写其正、负缓存。 */
export class ImportLibraryReader {
  static decodeChapter(record: ChapterRecord | undefined): ChapterRead {
    if (record === undefined) return { kind: 'absent' };
    try {
      if (typeof record.content !== 'string' || typeof record.lastModified !== 'string')
        throw importError(
          'INVALID_CHAPTER_CONTENT',
          'invalidChapterContentTheChapterContentRecordIsCorrupt',
          {},
        );
      const parsed: unknown = JSON.parse(record.content);
      if (!Array.isArray(parsed) || !parsed.every(validParagraph))
        throw importError(
          'INVALID_CHAPTER_CONTENT',
          'invalidChapterContentInvalidParagraphOrTranslationData',
          {},
        );
      if (new Set(parsed.map((p) => p.id)).size !== parsed.length)
        throw importError(
          'INVALID_CHAPTER_CONTENT',
          'invalidChapterContentDuplicateParagraphID',
          {},
        );
      return { kind: 'loaded', content: normalizeChapterLanguages(parsed), record };
    } catch (error) {
      return failure(error);
    }
  }

  static async readChapter(chapterId: string): Promise<ChapterRead> {
    try {
      const db = await getDB();
      return this.decodeChapter(await db.get('chapter-contents', chapterId));
    } catch (error) {
      return failure(error);
    }
  }

  static async readBook(bookId: string, options?: { chapterIds: string[] }): Promise<BookRead> {
    try {
      const db = await getDB();
      const tx = db.transaction(['books', 'chapter-contents', 'book-revisions'], 'readonly');
      // 即使单个请求失败，也消费最终的事务拒绝。
      const done = tx.done.catch(() => undefined);
      try {
        const raw = await tx.objectStore('books').get(bookId);
        if (raw === undefined) return { kind: 'absent' };
        if (
          !isRecord(raw) ||
          raw.id !== bookId ||
          typeof raw.title !== 'string' ||
          (raw.volumes !== undefined && !Array.isArray(raw.volumes))
        )
          throw importError('INVALID_BOOK', 'invalidBookTheNovelDataIsCorrupt', {});
        const revision = (await tx.objectStore('book-revisions').get(bookId))?.revision ?? 0;
        if (!Number.isSafeInteger(revision) || revision < 0)
          throw importError('INVALID_BOOK', 'invalidBookTheModificationRevisionIsCorrupt', {});
        const chapters: Record<string, ChapterRead> = Object.create(null) as Record<
          string,
          ChapterRead
        >;
        const seen = new Set<string>();
        const requested = options ? new Set(options.chapterIds) : undefined;
        for (const volume of raw.volumes ?? []) {
          if (!volume || (volume.chapters !== undefined && !Array.isArray(volume.chapters)))
            throw importError('INVALID_BOOK', 'invalidBookTheVolumeChapterDataIsCorrupt', {});
          for (const chapter of volume.chapters ?? []) {
            if (!chapter || typeof chapter.id !== 'string' || !chapter.id || seen.has(chapter.id))
              throw importError('INVALID_BOOK', 'invalidBookInvalidChapterID', {});
            seen.add(chapter.id);
            if (requested && !requested.has(chapter.id)) continue;
            chapters[chapter.id] = embeddedChapter(
              await tx.objectStore('chapter-contents').get(chapter.id),
              chapter,
            );
          }
        }
        await tx.done;
        // 旧数据可能是 Date 或 ISO 字符串，先统一再按日期字段恢复。
        return {
          kind: 'loaded',
          book: normalizeBookLanguages(deserializeDates(serializeDates(raw))),
          revision,
          chapters,
        };
      } finally {
        await done;
      }
    } catch (error) {
      return failure(error);
    }
  }
}
