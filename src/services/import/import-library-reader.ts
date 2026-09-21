import type { Novel, Paragraph, Chapter } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { deserializeDates, serializeDates } from 'src/utils/serialize-dates';

type ChapterRecord = { chapterId: string; content: string; lastModified: string };
type ReadFailure = { kind: 'failed'; message: string };
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
  return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
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
        throw new Error('INVALID_CHAPTER_CONTENT: 正文记录损坏');
      const parsed: unknown = JSON.parse(record.content);
      if (!Array.isArray(parsed) || !parsed.every(validParagraph))
        throw new Error('INVALID_CHAPTER_CONTENT: 段落或译文数据形状无效');
      if (new Set(parsed.map((p) => p.id)).size !== parsed.length)
        throw new Error('INVALID_CHAPTER_CONTENT: 段落标识重复');
      return { kind: 'loaded', content: parsed, record };
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
          throw new Error('INVALID_BOOK: 小说数据损坏');
        const revision = (await tx.objectStore('book-revisions').get(bookId))?.revision ?? 0;
        if (!Number.isSafeInteger(revision) || revision < 0)
          throw new Error('INVALID_BOOK: 修改序号损坏');
        const chapters: Record<string, ChapterRead> = Object.create(null) as Record<
          string,
          ChapterRead
        >;
        const seen = new Set<string>();
        const requested = options ? new Set(options.chapterIds) : undefined;
        for (const volume of raw.volumes ?? []) {
          if (!volume || (volume.chapters !== undefined && !Array.isArray(volume.chapters)))
            throw new Error('INVALID_BOOK: 卷章数据损坏');
          for (const chapter of volume.chapters ?? []) {
            if (!chapter || typeof chapter.id !== 'string' || !chapter.id || seen.has(chapter.id))
              throw new Error('INVALID_BOOK: 章节标识无效');
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
        return { kind: 'loaded', book: deserializeDates(serializeDates(raw)), revision, chapters };
      } finally {
        await done;
      }
    } catch (error) {
      return failure(error);
    }
  }
}
