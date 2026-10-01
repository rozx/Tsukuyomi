import { importFailure, importError, readImportError, serializeImportError } from './import-error';
import type { ImportNotice } from 'src/models/import-feedback';

import type { Novel, Chapter } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { ImportRepository } from './import-repository';
import { ImportLibraryReader } from './import-library-reader';

function titleOf(title: Chapter['title']): string {
  return typeof title === 'string' ? title : title.original;
}

function publicInfo(book: Novel) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    alternateTitles: book.alternateTitles ?? [],
    description: book.description,
    webUrls: book.webUrl ?? [],
    hasCover: Boolean(book.cover),
    volumeCount: book.volumes?.length ?? 0,
    chapterCount: (book.volumes ?? []).reduce(
      (total, volume) => total + (volume.chapters?.length ?? 0),
      0,
    ),
  };
}

async function requireTask(taskId: string): Promise<void> {
  if (!(await ImportRepository.getTask(taskId)))
    throw importError('TASK_NOT_FOUND', 'taskNotFoundTheImportTaskDoesNotExist', {});
}

function pagination(
  options: { offset?: number; limit?: number },
  defaultLimit: number,
): { offset: number; limit: number } {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? defaultLimit;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw importError('INVALID_PAGE', 'invalidPageAPageMustContainItems', {});
  return { offset, limit };
}

async function metadata(bookId: string) {
  const db = await getDB();
  const tx = db.transaction(['books', 'book-revisions'], 'readonly');
  const done = tx.done.catch(() => undefined);
  try {
    const book = await tx.objectStore('books').get(bookId);
    if (!book) throw importError('BOOK_NOT_FOUND', 'bookNotFoundTheSpecifiedNovelDoesNotExist', {});
    const revision = (await tx.objectStore('book-revisions').get(bookId))?.revision ?? 0;
    await tx.done;
    return { book, revision };
  } finally {
    await done;
  }
}

/** 导入的书库查询只使用显式 ID，不读取全局当前书籍、记忆或模型配置。 */
export class ImportLibraryService {
  static async search(
    taskId: string,
    options: { query: string; author?: string; url?: string; offset?: number; limit?: number },
  ) {
    await requireTask(taskId);
    if (typeof options.query !== 'string')
      throw importError('INVALID_QUERY', 'invalidQueryLibraryQueriesMustBeText', {});
    const { offset, limit } = pagination(options, 20);
    const query = options.query.trim().toLowerCase();
    const items = (await (await getDB()).getAll('books')).flatMap((book) => {
      const names = [book.title, ...(book.alternateTitles ?? [])];
      const reasons: ImportNotice[] = [];
      if (query && names.some((name) => name.toLowerCase().includes(query)))
        reasons.push(importFailure('TITLE_MATCH', 'matchTitle'));
      if (options.author && book.author?.includes(options.author))
        reasons.push(importFailure('AUTHOR_MATCH', 'matchAuthor'));
      if (options.url && book.webUrl?.includes(options.url))
        reasons.push(importFailure('URL_MATCH', 'matchUrl'));
      if ((query || options.author || options.url) && !reasons.length) return [];
      return [{ ...publicInfo(book), reasons }];
    });
    items.sort((a, b) => b.reasons.length - a.reasons.length || a.title.localeCompare(b.title));
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      ambiguous: items.length > 1,
      ...(offset + limit < items.length ? { nextOffset: offset + limit } : {}),
    };
  }

  static async book(taskId: string, bookId: string) {
    await requireTask(taskId);
    const result = await metadata(bookId);
    return { ...publicInfo(result.book), bookRevision: result.revision };
  }

  static async chapters(
    taskId: string,
    bookId: string,
    options: { offset?: number; limit?: number } = {},
  ) {
    await requireTask(taskId);
    const { book, revision } = await metadata(bookId);
    const { offset, limit } = pagination(options, 50);
    const chapters = (book.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).map((chapter) => ({
        id: chapter.id,
        title: titleOf(chapter.title),
        volumeId: volume.id,
        volumeTitle: titleOf(volume.title),
        webUrl: chapter.webUrl,
      })),
    );
    return {
      bookId,
      bookRevision: revision,
      items: chapters.slice(offset, offset + limit),
      total: chapters.length,
      ...(offset + limit < chapters.length ? { nextOffset: offset + limit } : {}),
    };
  }

  static async chapter(
    taskId: string,
    bookId: string,
    chapterId: string,
    options: { offset?: number; limit?: number } = {},
  ) {
    await requireTask(taskId);
    const { offset, limit } = pagination(options, 30);
    const snapshot = await ImportLibraryReader.readBook(bookId);
    if (snapshot.kind !== 'loaded')
      throw importError('BOOK_READ_FAILED', 'bookReadFailedDetail', {
        value1:
          snapshot.kind === 'failed'
            ? readImportError(snapshot)
            : importError('BOOK_READ_FAILED', 'bookReadFailedTheTargetNovelDoesNotExist'),
      });
    const chapter = (snapshot.book.volumes ?? [])
      .flatMap((volume) => volume.chapters ?? [])
      .find((entry) => entry.id === chapterId);
    if (!chapter)
      throw importError('TARGET_SCOPE', 'targetScopeTheChapterBelongsToAnotherNovel', {});
    const loaded = snapshot.chapters[chapterId]!;
    const paragraphs: {
      id: string;
      text: string;
      textLength: number;
      truncated: boolean;
      translationCount: number;
    }[] = [];
    if (loaded.kind === 'loaded') {
      let remaining = 16000;
      for (const paragraph of loaded.content.slice(offset, offset + limit)) {
        if (remaining <= 0) break;
        const text = paragraph.text.slice(0, Math.min(4000, remaining));
        remaining -= text.length;
        paragraphs.push({
          id: paragraph.id,
          text,
          textLength: paragraph.text.length,
          truncated: text.length < paragraph.text.length,
          translationCount: paragraph.translations.length,
        });
      }
    }
    const total = loaded.kind === 'loaded' ? loaded.content.length : undefined;
    return {
      bookId,
      bookRevision: snapshot.revision,
      chapterId,
      title: titleOf(chapter.title),
      status: loaded.kind,
      paragraphs,
      total,
      ...(loaded.kind === 'failed'
        ? {
            // 保留可重投影的自有错误记录：返回模型时投影为简中，工作台事件按界面语言展示
            error: serializeImportError(readImportError(loaded), 'CHAPTER_READ_FAILED'),
          }
        : {}),
      ...(total !== undefined && offset + paragraphs.length < total
        ? { nextOffset: offset + paragraphs.length }
        : {}),
    };
  }
}
