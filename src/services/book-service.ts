import { normalizeBookLanguages } from './localization/normalize';
import { deserializeDates, serializeDates } from 'src/utils/serialize-dates';
import { getDB } from 'src/utils/indexed-db';
import type { Novel, Terminology, CharacterSetting } from 'src/models/novel';
import { ChapterContentService } from './chapter-content-service';
import { LibraryPersistence } from './library-persistence';
import { maintainLibraryChanges } from './chapter-content-maintenance';
import type { AppLocale } from 'src/models/locale';
import type { EntityUpdates } from './localization/entity-edit';
import { prepareForceBook } from './localization/force';

async function maintainWholeBooks(books: Novel[]): Promise<void> {
  await maintainLibraryChanges(
    new Map(
      books.map((book) => [
        book.id,
        (book.volumes ?? []).flatMap((volume) =>
          (volume.chapters ?? []).map((chapter) => chapter.id),
        ),
      ]),
    ),
  );
}

/**
 * 书籍服务
 * 负责书籍的 CRUD 操作和持久化
 */
export class BookService {
  static async rollbackBooks(books: Novel[]): Promise<void> {
    await LibraryPersistence.rollbackBooks(await getDB(), books);
    await maintainWholeBooks(books);
  }

  static async prepareForceBooks(
    sources: Novel[],
    remoteBooks: Novel[],
    operationId: string,
  ): Promise<Novel[]> {
    const remote = remoteBooks.map(normalizeBookLanguages);
    const normalized = sources.map(normalizeBookLanguages);
    const db = await getDB();
    const prepared: Novel[] = [];
    for (const source of normalized)
      prepared.push(
        await prepareForceBook(
          db,
          source,
          remote.find((book) => book.id === source.id),
          operationId,
        ),
      );
    await BookService.commitForceBooks(sources, prepared);
    return prepared;
  }

  static async commitForceBooks(sources: Novel[], prepared: Novel[]): Promise<void> {
    await maintainLibraryChanges(
      await LibraryPersistence.commitForceBooks(await getDB(), sources, prepared),
    );
  }

  static async replaceBooks(books: Novel[], operationId: string): Promise<void> {
    await LibraryPersistence.replaceBooks(await getDB(), books, operationId);
    await maintainWholeBooks(books);
  }

  static async restoreEntity<T extends Terminology | CharacterSetting>(
    bookId: string,
    kind: 'term' | 'character',
    entity: T,
    operationId: string,
  ): Promise<T> {
    return LibraryPersistence.restoreEntity(await getDB(), bookId, kind, entity, operationId);
  }

  static async editEntities(
    base: Novel,
    updates: EntityUpdates,
    locale: AppLocale,
  ): Promise<Novel> {
    return deserializeDates(
      await LibraryPersistence.editEntities(await getDB(), base, updates, locale),
    );
  }

  /**
   * 获取所有书籍（不包含章节内容）
   */
  static async getAllBooks(): Promise<Novel[]> {
    try {
      const db = await getDB();
      const books = await db.getAll('books');
      // 书籍列表不需要加载章节内容，直接返回
      return books.map((book) => normalizeBookLanguages(deserializeDates(serializeDates(book))));
    } catch (error) {
      console.error('Failed to load books:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取书籍（不包含章节内容）
   * @param loadContent 是否加载章节内容，默认为 false
   */
  static async getBookById(id: string, loadContent = false): Promise<Novel | undefined> {
    try {
      const db = await getDB();
      const book = await db.get('books', id);
      if (!book) return undefined;

      const deserializedBook = normalizeBookLanguages(deserializeDates(serializeDates(book)));

      // 如果需要加载内容，遍历所有章节并加载
      if (loadContent && deserializedBook.volumes) {
        for (const volume of deserializedBook.volumes) {
          if (volume.chapters) {
            for (let i = 0; i < volume.chapters.length; i++) {
              const chapter = volume.chapters[i];
              if (chapter && !chapter.content) {
                // 从独立存储加载章节内容
                const content = await ChapterContentService.loadChapterContent(chapter.id);
                if (content) {
                  volume.chapters[i] = {
                    ...chapter,
                    content,
                    contentLoaded: true,
                  };
                }
              }
            }
          }
        }
      }

      return deserializedBook;
    } catch (error) {
      console.error(`Failed to load book ${id}:`, error);
      return undefined;
    }
  }

  /**
   * 保存/更新书籍
   * 章节内容会被剥离并单独存储
   * @param book 书籍对象
   * @param options 保存选项
   * @param options.saveChapterContent 是否保存章节内容，默认为 true。如果为 false，则只保存书籍元数据（适用于仅更新术语、角色设定等元数据的场景）
   */
  static async saveBook(
    this: void,
    book: Novel,
    options?: { saveChapterContent?: boolean },
  ): Promise<void> {
    const changes = await LibraryPersistence.saveBooks(
      await getDB(),
      [book],
      options?.saveChapterContent !== false,
    );
    await maintainLibraryChanges(changes);
  }

  /**
   * 批量保存书籍
   * 章节内容会被剥离并单独存储
   */
  static async bulkSaveBooks(books: Novel[]): Promise<void> {
    await maintainLibraryChanges(await LibraryPersistence.saveBooks(await getDB(), books));
  }

  /**
   * 删除书籍
   * 同时删除相关的章节内容
   */
  static async deleteBook(id: string, options?: { recordDeletion?: boolean }): Promise<void> {
    const ids = await LibraryPersistence.deleteBook(await getDB(), id, options?.recordDeletion);
    if (ids.length) await maintainLibraryChanges(new Map([[id, ids]]));
  }

  /**
   * 清空所有书籍
   * 同时清空所有章节内容
   */
  static async clearBooks(): Promise<void> {
    const changes = await LibraryPersistence.clear(await getDB(), true);
    ChapterContentService.clearAllCache();
    await maintainLibraryChanges(changes);
  }
}
