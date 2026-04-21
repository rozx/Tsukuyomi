import { useBooksStore } from 'src/stores/books';
import { ensureChapterContentLoaded, getChapterContentText } from 'src/utils/novel-utils';
import type { Chapter, Novel } from 'src/models/novel';

/**
 * 在书籍中查找指定 ID 的章节，未找到返回 null
 */
function findChapterInBook(book: Novel, chapterId: string): Chapter | null {
  for (const volume of book.volumes || []) {
    for (const chapter of volume.chapters || []) {
      if (chapter.id === chapterId) {
        return chapter;
      }
    }
  }
  return null;
}

/**
 * 按章节范围过滤实体列表：
 * 1. 查找章节；找不到 -> 返回空数组
 * 2. 加载章节内容并取纯文本；为空 -> 返回空数组
 * 3. 以文本匹配器过滤实体
 *
 * 用于 list_characters / list_terms 等按章节缩减候选集的工具。
 */
export async function filterEntitiesForChapter<T>(
  book: Novel,
  chapterId: string,
  allEntities: T[],
  matcher: (text: string, entities: T[]) => T[],
): Promise<T[]> {
  const foundChapter = findChapterInBook(book, chapterId);
  if (!foundChapter) {
    return [];
  }

  const chapterWithContent = await ensureChapterContentLoaded(foundChapter);
  const chapterText = getChapterContentText(chapterWithContent);
  if (!chapterText) {
    return [];
  }

  return matcher(chapterText, allEntities);
}

/**
 * 校验关键词数组：必须非空，剔除空白字符串，否则抛错
 * 用于 search_*_by_keywords 类工具的入参校验
 */
export function requireValidKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('关键词数组不能为空');
  }
  const valid = raw.filter(
    (k): k is string => typeof k === 'string' && k.trim().length > 0,
  );
  if (valid.length === 0) {
    throw new Error('关键词数组不能为空');
  }
  return valid;
}

/**
 * 通过 Pinia books store 同步读取书籍，未找到抛错
 *
 * 注意：使用同步的 `useBooksStore().getBookById`，与 `book-tools.ts` 中基于
 * `BookService.getBookById` 的异步版本不通用。仅用于工具已在 store 初始化后的场景。
 */
export function resolveBookSync(bookId: string): Novel {
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  if (!book) {
    throw new Error(`书籍不存在: ${bookId}`);
  }
  return book;
}
